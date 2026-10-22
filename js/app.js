// ==========================================================================
//  APP — orquestador
//  Conecta la interfaz con el motor, la escena 3D, las gráficas y la API.
// ==========================================================================

const App = {

    especies: [],
    especie: null,
    sim: null,          // resultado de Motor.simular() para la corrida actual
    slots: { A: null, B: null },

    modo: 'simulador',  // 'simulador' | 'comparar'
    dia: 0,
    reproduciendo: true,
    velocidad: 8,       // días simulados por segundo
    ultimoTick: 0,

    // ----------------------------------------------------------------------
    async iniciar() {
        this.cachearNodos();
        this.conectarEventos();

        Escena.iniciar(this.n.lienzo);
        Escena.onSeleccion = (datos, malla) => this.mostrarParte(datos, malla);

        Graficas.iniciarBiomasa(document.getElementById('g-biomasa'));
        Graficas.iniciarEstres(document.getElementById('g-estres'));

        await this.cargarEspecies();
        this.simular();
        this.bucle();
    },

    cachearNodos() {
        const id = x => document.getElementById(x);
        this.n = {
            lienzo: id('lienzo'), estadoApi: id('estado-api'),
            selEspecie: id('sel-especie'), fichaEspecie: id('ficha-especie'),
            selModelo: id('sel-modelo'), formula: id('formula-modelo'),
            hudDia: id('hud-dia'), hudRelleno: id('hud-relleno'), hudPct: id('hud-pct'),
            accion: id('accion'), decisiones: id('lista-decisiones'),
            panelParte: id('panel-parte'),
            msgGuardar: id('msg-guardar'),
            veredicto: id('veredicto'), tarjetas: id('tarjetas-ab'),
            tablaHistorial: id('tabla-historial'),
            resumenGlobal: id('resumen-global'), tablaTop: id('tabla-top'),
            tablaEficiencia: id('tabla-eficiencia'), listaAlertas: id('lista-alertas'),
            tablaMediciones: id('tabla-mediciones')
        };

        // Deslizadores: id del input -> id del <b> que muestra su valor
        this.sliders = {
            'in-r': 'v-r', 'in-k': 'v-k', 'in-dias': 'v-dias',
            'in-luz': 'v-luz', 'in-agua': 'v-agua', 'in-temp': 'v-temp',
            'in-nutri': 'v-nutri', 'in-co2': 'v-co2',
            'in-macetas': 'v-macetas'
        };
    },

    valor(idInput) { return parseFloat(document.getElementById(idInput).value); },

    pintarSliders() {
        document.getElementById('v-r').textContent    = this.valor('in-r').toFixed(3);
        document.getElementById('v-k').textContent    = this.valor('in-k');
        document.getElementById('v-dias').textContent = this.valor('in-dias');
        document.getElementById('v-luz').textContent  = this.valor('in-luz');
        document.getElementById('v-agua').textContent = this.valor('in-agua');
        document.getElementById('v-temp').textContent = this.valor('in-temp');
        document.getElementById('v-nutri').textContent= this.valor('in-nutri');
        document.getElementById('v-co2').textContent  = this.valor('in-co2');
        document.getElementById('v-macetas').textContent = this.valor('in-macetas');
    },

    conectarEventos() {
        // Pestañas
        document.querySelectorAll('.pestana').forEach(b => {
            b.addEventListener('click', () => this.cambiarVista(b.dataset.vista, b));
        });

        // Deslizadores: refrescan su etiqueta al moverse
        Object.keys(this.sliders).forEach(k => {
            document.getElementById(k).addEventListener('input', () => this.pintarSliders());
        });

        document.getElementById('sel-especie').addEventListener('change', () => this.elegirEspecie());
        document.getElementById('sel-modelo').addEventListener('change', () => this.pintarFormula());

        document.getElementById('btn-simular').addEventListener('click', () => this.simular());
        document.getElementById('btn-optimo').addEventListener('click', () => this.usarOptimo());
        document.getElementById('btn-guardar').addEventListener('click', () => this.guardar());

        document.getElementById('btn-slot-a').addEventListener('click', () => this.fijarSlot('A'));
        document.getElementById('btn-slot-b').addEventListener('click', () => this.fijarSlot('B'));

        document.getElementById('btn-play').addEventListener('click', e => {
            this.reproduciendo = !this.reproduciendo;
            e.target.textContent = this.reproduciendo ? '⏸' : '▶';
        });

        document.getElementById('in-vel').addEventListener('input', e => {
            this.velocidad = +e.target.value;
            document.getElementById('v-vel').textContent = this.velocidad;
        });

        document.getElementById('btn-reset-cam').addEventListener('click', () => Escena.reiniciarCamara());

        // Cambiar el número de macetas solo resiembra la escena: la
        // simulación en curso no se reinicia, se sigue viendo el mismo día.
        document.getElementById('in-macetas').addEventListener('change', () => {
            if (this.modo === 'comparar') return;
            this.sembrar();
            this.actualizarKpis();
        });

        document.getElementById('btn-tabla').addEventListener('click', e => {
            const t = this.n.tablaMediciones;
            t.classList.toggle('oculto');
            e.target.textContent = t.classList.contains('oculto')
                ? 'Ver tabla de datos' : 'Ocultar tabla';
        });
    },

    // ----------------------------------------------------------------------
    // Catálogo de especies (viene de MySQL)
    // ----------------------------------------------------------------------
    async cargarEspecies() {
        try {
            this.especies = await API.especies();
            this.n.estadoApi.textContent = `API conectada · ${this.especies.length} especies`;
            this.n.estadoApi.className = 'chip ok';
        } catch (e) {
            this.n.estadoApi.textContent = 'API sin conexión';
            this.n.estadoApi.className = 'chip error';
            console.error(e);

            // Sin API no hay catálogo: cargamos una especie mínima para que la
            // escena 3D siga siendo explorable y el error sea evidente.
            this.especies = [{
                id: 0, nombre_comun: 'Sin catálogo', nombre_cientifico: '—', familia: '—',
                modelo_default: 'logistico', r_default: 0.15, k_default: 300,
                biomasa_inicial: 0.6, dias_madurez: 100,
                luz_optima: 85, agua_optima: 70, temp_optima: 22,
                nutrientes_optimo: 80, co2_optimo: 400,
                tol_luz: 40, tol_agua: 30, tol_temp: 10, tol_nutrientes: 35, tol_co2: 250,
                color_petalo: '#ff8c2b', color_hoja: '#7f9a3c', n_ramas: 3,
                altura_max_u: 2.0, notas: 'La API no respondió. Revisa Apache y MySQL.'
            }];
        }

        this.n.selEspecie.innerHTML = this.especies
            .map(e => `<option value="${e.id}">${e.nombre_comun} — ${e.nombre_cientifico}</option>`)
            .join('');

        this.elegirEspecie();
    },

    elegirEspecie() {
        const id = +this.n.selEspecie.value;
        this.especie = this.especies.find(e => e.id === id) || this.especies[0];
        const e = this.especie;

        this.n.fichaEspecie.innerHTML =
            `<b>${e.familia}</b> · madurez de referencia ${e.dias_madurez} días.<br>${e.notas || ''}`;

        // Los parámetros del modelo y el ambiente arrancan en el óptimo
        document.getElementById('sel-modelo').value = e.modelo_default;
        document.getElementById('in-r').value    = e.r_default;
        document.getElementById('in-k').value    = e.k_default;
        document.getElementById('in-dias').value = e.dias_madurez;
        this.usarOptimo();
        this.pintarFormula();

        document.getElementById('in-nombre').value =
            `${e.nombre_comun} · corrida ${new Date().toLocaleDateString('es-MX')}`;
    },

    usarOptimo() {
        const e = this.especie;
        document.getElementById('in-luz').value   = e.luz_optima;
        document.getElementById('in-agua').value  = e.agua_optima;
        document.getElementById('in-temp').value  = e.temp_optima;
        document.getElementById('in-nutri').value = e.nutrientes_optimo;
        document.getElementById('in-co2').value   = e.co2_optimo;
        this.pintarSliders();
    },

    pintarFormula() {
        const info = MODELOS_INFO[document.getElementById('sel-modelo').value];
        this.n.formula.innerHTML = `${info.formula}<br><span style="font-family:system-ui">${info.descripcion}</span>`;
    },

    // ----------------------------------------------------------------------
    // Ejecutar la simulación
    // ----------------------------------------------------------------------
    configActual() {
        return {
            especie: this.especie,
            especie_id: this.especie.id,
            modelo: document.getElementById('sel-modelo').value,
            r: this.valor('in-r'),
            k: this.valor('in-k'),
            dias: this.valor('in-dias'),
            luz: this.valor('in-luz'),
            agua: this.valor('in-agua'),
            temperatura: this.valor('in-temp'),
            nutrientes: this.valor('in-nutri'),
            co2: this.valor('in-co2')
        };
    },

    simular() {
        const cfg = this.configActual();
        this.sim = Motor.simular(cfg);
        this.dia = 0;
        this.reproduciendo = true;
        document.getElementById('btn-play').textContent = '⏸';

        this.sembrar();

        Graficas.dibujarBiomasa([
            { nombre: this.especie.nombre_comun, color: Graficas.COLORES.A,
              mediciones: this.sim.mediciones }
        ]);
        Graficas.dibujarEstres(this.sim.estres);
        this.n.tablaMediciones.innerHTML = Graficas.tablaMediciones(this.sim.mediciones);

        this.pintarDecisiones();
        this.actualizarKpis();
    },

    /**
     * Siembra la parcela: de 1 a 4 macetas de la especie elegida, con su
     * silueta y sus colores. Se llama al simular y al mover el deslizador
     * de macetas.
     */
    sembrar() {
        Escena.limpiar();
        Escena.crearPlanta('actual', {
            ...this.especie,
            macetas: this.valor('in-macetas'),
            x: 0, escala: 1, etiqueta: ''
        });
        Escena.setModoAB(false);
    },

    pintarDecisiones() {
        const icono = { critico: '🔴', aviso: '🟡', info: '🔵' };

        this.n.decisiones.innerHTML = this.sim.decisiones.map(d => `
            <div class="item ${d.severidad}">
                <span class="icono">${icono[d.severidad]}</span>
                <div>
                    <div>${d.mensaje}</div>
                    ${d.valor_sugerido
                        ? `<div class="nota">Sugerido · ${d.valor_sugerido}</div>` : ''}
                </div>
                <span class="dia">d${d.dia}</span>
            </div>`).join('');
    },

    // ----------------------------------------------------------------------
    // Reproducción día a día
    // ----------------------------------------------------------------------
    bucle() {
        requestAnimationFrame(t => {
            if (this.sim && this.reproduciendo) {
                const dt = (t - this.ultimoTick) / 1000;

                if (dt >= 1 / this.velocidad) {
                    this.ultimoTick = t;
                    const tope = this.modo === 'comparar'
                        ? Math.max(this.slots.A?.config.dias ?? 0, this.slots.B?.config.dias ?? 0)
                        : this.sim.config.dias;

                    if (this.dia < tope) {
                        this.dia++;
                        if (this.modo === 'comparar') this.avanzarComparacion();
                        else this.actualizarKpis();
                    }
                }
            } else {
                this.ultimoTick = t;
            }

            this.bucle();
        });
    },

    medicionActual(sim, dia) {
        return sim.mediciones[Math.min(dia, sim.mediciones.length - 1)];
    },

    actualizarKpis() {
        if (!this.sim) return;

        const m = this.medicionActual(this.sim, this.dia);
        const K = this.sim.resumen.k_efectiva;
        const fraccion = m.biomasa / K;

        Escena.setCrecimiento('actual', fraccion, m.estres_total);

        const txt = (id, v) => { document.getElementById(id).textContent = v; };
        txt('kpi-dia', this.dia);
        txt('kpi-biomasa', m.biomasa.toFixed(1) + ' g');
        txt('kpi-altura', m.altura.toFixed(2) + ' u');
        txt('kpi-hojas', m.n_hojas);
        txt('kpi-ramas', m.n_ramas);
        txt('kpi-icr', m.icr.toFixed(4));
        txt('kpi-estres', `${m.estres_total.toFixed(0)} / 100`);

        // La parcela es la suma de las macetas. El modelo sigue siendo por
        // planta: aquí no se simula competencia entre vecinas.
        const nMacetas = this.valor('in-macetas');
        txt('kpi-parcela', nMacetas === 1
            ? '— una sola maceta'
            : `${(m.biomasa * nMacetas).toFixed(1)} g · ${nMacetas} macetas`);

        const madurez = this.sim.resumen.dias_a_madurez;
        txt('kpi-cosecha', madurez === null
            ? 'No madura en el ciclo'
            : this.dia < madurez
                ? `Día ${madurez} · faltan ${madurez - this.dia}`
                : `Lista desde el día ${madurez}`);

        const pct = Math.round(fraccion * 100);
        this.n.hudDia.textContent = `Día ${this.dia}`;
        this.n.hudRelleno.style.width = Math.min(100, pct) + '%';
        this.n.hudPct.textContent = pct + ' %';

        const acc = Motor.proximaAccion(this.sim, this.dia);
        this.n.accion.textContent = acc.mensaje;
        this.n.accion.className = 'aviso ' + acc.severidad;

        // Si hay una parte seleccionada, su ficha también cambia con el día
        if (Escena.seleccionado) this.mostrarParte(Escena.seleccionado.userData, Escena.seleccionado);
    },

    // ----------------------------------------------------------------------
    // Panel de la parte seleccionada (raycasting)
    // ----------------------------------------------------------------------
    mostrarParte(datos, malla) {
        if (!datos) { this.n.panelParte.classList.add('oculto'); return; }

        this.n.panelParte.classList.remove('oculto');

        const sim = datos.planta === 'B' ? this.slots.B : (this.slots[datos.planta] || this.sim);
        const m = sim ? this.medicionActual(sim, this.dia) : null;

        const txt = (id, v) => { document.getElementById(id).textContent = v; };
        txt('parte-nombre', datos.nombre);
        txt('parte-geo', datos.geometria);
        txt('parte-crec', Math.round((datos.progreso ?? 1) * 100) + ' %');
        txt('parte-altura', Escena.alturaMundo(malla).toFixed(2) + ' u');
        txt('parte-estres', m ? `${m.estres_total.toFixed(0)} / 100` : '—');

        const aporte = m ? Motor.contribucionDe(datos.nombreBase, m.biomasa) : null;
        txt('parte-biomasa', aporte === null ? 'no aporta' : aporte.toFixed(2) + ' g');

        txt('parte-especie', sim ? sim.config.especie.nombre_cientifico : '—');
        document.getElementById('parte-funcion').textContent = datos.funcion;
    },

    // ----------------------------------------------------------------------
    // Escenarios A/B
    // ----------------------------------------------------------------------
    fijarSlot(letra) {
        if (!this.sim) return;

        this.slots[letra] = this.sim;
        document.getElementById('btn-slot-' + letra.toLowerCase()).textContent =
            `✓ ${letra}: ${this.especie.nombre_comun}`;

        this.pintarComparacion();
    },

    pintarComparacion() {
        const { A, B } = this.slots;

        if (!A || !B) {
            this.n.veredicto.className = 'aviso info';
            this.n.veredicto.textContent = A || B
                ? 'Falta fijar el otro escenario.'
                : 'Aún no hay dos escenarios fijados.';
            this.n.tarjetas.innerHTML = '';
            return;
        }

        // Mismo criterio que usa el endpoint /comparar del servidor: gana quien
        // más biomasa produce, y si empatan desempata quien madure antes.
        const difB = +(B.resumen.biomasa_final - A.resumen.biomasa_final).toFixed(2);
        const maxB = Math.max(A.resumen.biomasa_final, B.resumen.biomasa_final);
        const dA = A.resumen.dias_a_madurez, dB = B.resumen.dias_a_madurez;
        const difD = (dA !== null && dB !== null) ? dB - dA : null;

        let gana = 'empate';
        if (Math.abs(difB) > 0.01 * maxB) gana = difB > 0 ? 'B' : 'A';
        else if (difD) gana = difD < 0 ? 'B' : 'A';

        this.n.veredicto.className = 'aviso ' + (gana === 'empate' ? 'info' : 'aviso');
        this.n.veredicto.innerHTML = gana === 'empate'
            ? 'Los dos escenarios rinden prácticamente lo mismo. Decide por costo.'
            : `<b>Gana el escenario ${gana}</b>: ${Math.abs(difB).toFixed(2)} g más de biomasa`
              + (difD ? ` y madura ${Math.abs(difD)} días ${difD < 0 === (gana === 'B') ? 'antes' : 'después'}` : '')
              + `. Estrés ${A.resumen.estres_promedio.toFixed(0)} vs ${B.resumen.estres_promedio.toFixed(0)}.`;

        const tarjeta = (letra, s, color) => `
            <div class="tarjeta ${gana === letra ? 'gana' : ''}">
                <h4><span class="marca" style="background:${color}"></span>
                    Escenario ${letra} — ${s.config.especie.nombre_comun}
                    ${gana === letra ? ' · gana' : ''}</h4>
                <p class="nota">${MODELOS_INFO[s.config.modelo].etiqueta} · r ${s.config.r} · K ${s.config.k} g</p>
                <dl>
                    <dt>Biomasa final</dt><dd>${s.resumen.biomasa_final} g</dd>
                    <dt>Días a madurez</dt><dd>${s.resumen.dias_a_madurez ?? 'no madura'}</dd>
                    <dt>Estrés total</dt><dd>${s.resumen.estres_promedio.toFixed(1)} / 100</dd>
                    <dt>Eficiencia</dt><dd>${s.resumen.eficiencia} g/día</dd>
                    <dt>Agua / Temp</dt><dd>${s.config.agua} % · ${s.config.temperatura} °C</dd>
                    <dt>Luz / Nutrientes</dt><dd>${s.config.luz} % · ${s.config.nutrientes} %</dd>
                </dl>
            </div>`;

        this.n.tarjetas.innerHTML =
            tarjeta('A', A, Graficas.COLORES.A) + tarjeta('B', B, Graficas.COLORES.B);

        if (!this.gComparar) {
            this.gComparar = true;
            Graficas.biomasaComparar = new Chart(document.getElementById('g-comparar'), {
                type: 'line',
                data: { labels: [], datasets: [] },
                options: {
                    ...Graficas.comunes('Biomasa: escenario A vs B (g)'),
                    scales: Graficas.ejes('gramos'),
                    layout: { padding: { right: 56 } }
                },
                plugins: [Graficas.etiquetasDirectas]
            });
        }

        const g = Graficas.biomasaComparar;
        const larga = A.mediciones.length >= B.mediciones.length ? A.mediciones : B.mediciones;
        g.data.labels = larga.map(m => m.dia);
        g.data.datasets = [
            Graficas.serie('A', Graficas.COLORES.A, A.mediciones),
            Graficas.serie('B', Graficas.COLORES.B, B.mediciones)
        ];
        g.update('none');
    },

    /** Avanza el crecimiento de las dos plantas en la vista de comparación. */
    avanzarComparacion() {
        const { A, B } = this.slots;
        if (!A || !B) return;

        const mA = this.medicionActual(A, this.dia);
        const mB = this.medicionActual(B, this.dia);

        Escena.setCrecimiento('A', mA.biomasa / A.resumen.k_efectiva, mA.estres_total);
        Escena.setCrecimiento('B', mB.biomasa / B.resumen.k_efectiva, mB.estres_total);

        const pct = Math.round(Math.max(mA.biomasa / A.resumen.k_efectiva,
                                        mB.biomasa / B.resumen.k_efectiva) * 100);
        this.n.hudDia.textContent = `Día ${this.dia}`;
        this.n.hudRelleno.style.width = Math.min(100, pct) + '%';
        this.n.hudPct.textContent = `A ${mA.biomasa.toFixed(0)} g · B ${mB.biomasa.toFixed(0)} g`;
    },

    /** En la vista de comparación se muestran las dos plantas lado a lado. */
    escenaComparar() {
        const { A, B } = this.slots;
        if (!A || !B) return;

        Escena.limpiar();
        Escena.crearPlanta('A', { ...A.config.especie, x: -1.15, escala: 0.85, etiqueta: ' (A)' });
        Escena.crearPlanta('B', { ...B.config.especie, x:  1.15, escala: 0.85, etiqueta: ' (B)' });
        Escena.setModoAB(true);
        this.dia = 0;

        const mA = this.medicionActual(A, this.dia);
        const mB = this.medicionActual(B, this.dia);
        Escena.setCrecimiento('A', mA.biomasa / A.resumen.k_efectiva, mA.estres_total);
        Escena.setCrecimiento('B', mB.biomasa / B.resumen.k_efectiva, mB.estres_total);
    },

    // ----------------------------------------------------------------------
    // Guardar en MySQL
    // ----------------------------------------------------------------------
    async guardar() {
        if (!this.sim) return;

        const msg = this.n.msgGuardar;
        msg.textContent = 'Guardando…';

        const c = this.sim.config;
        const r = this.sim.resumen;

        // Para no mandar 200 filas por corrida, se guarda una medición cada
        // 5 días más el último día: suficiente para reconstruir la curva.
        const paso = Math.max(1, Math.round(c.dias / 24));
        const medicionesRalas = this.sim.mediciones.filter(
            (m, i) => i % paso === 0 || i === this.sim.mediciones.length - 1);

        const letra = Object.keys(this.slots).find(k => this.slots[k] === this.sim);

        try {
            const guardada = await API.guardar({
                simulacion: {
                    especie_id: c.especie_id,
                    nombre: document.getElementById('in-nombre').value || 'Corrida sin nombre',
                    notas: document.getElementById('in-notas').value || null,
                    modelo: c.modelo, r: c.r, k: c.k, dias: c.dias,
                    luz: c.luz, agua: c.agua, temperatura: c.temperatura,
                    nutrientes: c.nutrientes, co2: c.co2,
                    escenario: letra || 'UNICO',
                    grupo_ab: letra ? `comparacion-${c.especie.nombre_comun.toLowerCase()}` : null,
                    biomasa_final: r.biomasa_final,
                    altura_final: r.altura_final,
                    hojas_final: r.hojas_final,
                    dias_a_madurez: r.dias_a_madurez,
                    estres_promedio: r.estres_promedio,
                    icr_promedio: r.icr_promedio,
                    eficiencia: r.eficiencia
                },
                mediciones: medicionesRalas,
                decisiones: this.sim.decisiones
            });

            msg.innerHTML = `Guardada con id <b>${guardada.id}</b> · `
                          + `${guardada.mediciones.length} mediciones.`;

        } catch (e) {
            msg.textContent = 'Error: ' + e.message;
        }
    },

    // ----------------------------------------------------------------------
    // Vistas
    // ----------------------------------------------------------------------
    cambiarVista(vista, boton) {
        document.querySelectorAll('.pestana').forEach(b => b.classList.remove('activa'));
        boton.classList.add('activa');

        document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
        document.getElementById('vista-' + vista).classList.add('activa');

        this.modo = (vista === 'comparar') ? 'comparar' : 'simulador';

        if (vista === 'simulador') {
            this.moverEscena('col-escena-destino');
            // Volver del modo A/B deja la escena con dos plantas: la rehacemos
            if (Object.keys(Escena.plantas).length !== 1) this.simular();
        }

        if (vista === 'comparar') {
            this.pintarComparacion();
            this.moverEscena('slot-escena-comparar');
            this.escenaComparar();
        }
        if (vista === 'historial') this.cargarHistorial();
        if (vista === 'reportes')  this.cargarReportes();
    },

    /**
     * Muda el bloque de la escena entre vistas. Three.js solo puede tener un
     * contexto WebGL por canvas, así que en vez de duplicarlo se reubica el
     * nodo en el DOM y se recalcula el tamaño.
     */
    moverEscena(destinoId) {
        const bloque = document.getElementById('col-escena');
        const destino = document.getElementById(destinoId);
        if (!destino || bloque.parentElement === destino) {
            setTimeout(() => Escena.redimensionar(), 30);
            return;
        }

        destino.appendChild(bloque);
        setTimeout(() => Escena.redimensionar(), 30);
    },

    async cargarHistorial() {
        this.n.tablaHistorial.innerHTML = '<p class="nota">Cargando…</p>';

        try {
            const filas = await API.simulaciones({ limite: 100 });

            if (!filas.length) {
                this.n.tablaHistorial.innerHTML =
                    '<p class="nota">Todavía no hay simulaciones guardadas.</p>';
                return;
            }

            this.n.tablaHistorial.innerHTML = `
                <table class="tabla">
                    <thead><tr>
                        <th>Id</th><th>Nombre</th><th>Especie</th><th>Modelo</th>
                        <th>Esc.</th><th>Biomasa</th><th>Madurez</th><th>Estrés</th>
                        <th>Eficiencia</th><th>Fecha</th><th></th>
                    </tr></thead>
                    <tbody>${filas.map(f => `
                        <tr>
                            <td>${f.id}</td>
                            <td>${f.nombre}</td>
                            <td>${f.nombre_comun}</td>
                            <td>${MODELOS_INFO[f.modelo]?.etiqueta ?? f.modelo}</td>
                            <td>${f.escenario}</td>
                            <td>${f.biomasa_final} g</td>
                            <td>${f.dias_a_madurez ?? '—'}</td>
                            <td>${f.estres_promedio}</td>
                            <td>${f.eficiencia}</td>
                            <td>${new Date(f.creada_en.replace(' ', 'T')).toLocaleDateString('es-MX')}</td>
                            <td class="acciones">
                                <button onclick="App.cargarSimulacion(${f.id})">Cargar</button>
                                <a href="${API.urlCsv(f.id)}"><button>CSV</button></a>
                                <button onclick="App.borrarSimulacion(${f.id})">✕</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;

        } catch (e) {
            this.n.tablaHistorial.innerHTML = `<p class="nota">Error: ${e.message}</p>`;
        }
    },

    /** Reproduce una corrida guardada: repone su configuración y la re-simula. */
    async cargarSimulacion(id) {
        try {
            const s = await API.simulacion(id);

            this.n.selEspecie.value = s.especie_id;
            this.elegirEspecie();

            document.getElementById('sel-modelo').value = s.modelo;
            document.getElementById('in-r').value     = s.r;
            document.getElementById('in-k').value     = s.k;
            document.getElementById('in-dias').value  = s.dias;
            document.getElementById('in-luz').value   = s.luz;
            document.getElementById('in-agua').value  = s.agua;
            document.getElementById('in-temp').value  = s.temperatura;
            document.getElementById('in-nutri').value = s.nutrientes;
            document.getElementById('in-co2').value   = s.co2;
            document.getElementById('in-nombre').value = s.nombre;
            document.getElementById('in-notas').value  = s.notas || '';

            this.pintarSliders();
            this.pintarFormula();
            this.simular();

            document.querySelector('.pestana[data-vista="simulador"]').click();

        } catch (e) {
            alert('No se pudo cargar: ' + e.message);
        }
    },

    async borrarSimulacion(id) {
        if (!confirm(`¿Borrar la simulación ${id} y todas sus mediciones?`)) return;

        try {
            await API.borrar(id);
            this.cargarHistorial();
        } catch (e) {
            alert('No se pudo borrar: ' + e.message);
        }
    },

    async cargarReportes() {
        try {
            const [resumen, top, eficiencia, alertas] = await Promise.all([
                API.resumen(), API.topBiomasa(5), API.eficiencia(), API.alertas(12)
            ]);

            this.n.resumenGlobal.innerHTML = [
                ['Simulaciones', resumen.n_simulaciones ?? 0],
                ['Especies probadas', resumen.n_especies_probadas ?? 0],
                ['Biomasa media', (resumen.biomasa_media ?? 0) + ' g'],
                ['Biomasa máxima', (resumen.biomasa_maxima ?? 0) + ' g'],
                ['Estrés medio', (resumen.estres_medio ?? 0) + ' / 100'],
                ['Más eficiente', resumen.especie_mas_eficiente ?? '—']
            ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('');

            this.n.tablaTop.innerHTML = top.length ? `
                <table class="tabla">
                    <thead><tr><th>#</th><th>Simulación</th><th>Especie</th>
                        <th>Biomasa</th><th>Madurez</th><th>Estrés</th><th>Eficiencia</th></tr></thead>
                    <tbody>${top.map((t, i) => `<tr>
                        <td>${i + 1}</td><td>${t.nombre}</td><td>${t.nombre_comun}</td>
                        <td>${t.biomasa_final} g</td><td>${t.dias_a_madurez ?? '—'}</td>
                        <td>${t.estres_promedio}</td><td>${t.eficiencia} g/día</td>
                    </tr>`).join('')}</tbody>
                </table>` : '<p class="nota">Sin datos todavía.</p>';

            this.n.tablaEficiencia.innerHTML = eficiencia.length ? `
                <table class="tabla">
                    <thead><tr><th>Especie</th><th>Corridas</th><th>Biomasa media</th>
                        <th>Estrés medio</th><th>Días a madurez</th><th>Eficiencia</th></tr></thead>
                    <tbody>${eficiencia.map(e => `<tr>
                        <td>${e.nombre_comun} <span class="nota">${e.nombre_cientifico}</span></td>
                        <td>${e.n_simulaciones}</td><td>${e.biomasa_media} g</td>
                        <td>${e.estres_medio}</td><td>${e.dias_madurez_medio ?? '—'}</td>
                        <td>${e.eficiencia_media} g/día</td>
                    </tr>`).join('')}</tbody>
                </table>` : '<p class="nota">Sin datos todavía.</p>';

            const icono = { critico: '🔴', aviso: '🟡', info: '🔵' };
            this.n.listaAlertas.innerHTML = alertas.length ? alertas.map(a => `
                <div class="item ${a.severidad}">
                    <span class="icono">${icono[a.severidad]}</span>
                    <div><div>${a.mensaje}</div>
                        <div class="nota">${a.simulacion} · ${a.nombre_comun}</div></div>
                    <span class="dia">d${a.dia}</span>
                </div>`).join('') : '<p class="nota">Ninguna alerta registrada.</p>';

        } catch (e) {
            this.n.resumenGlobal.innerHTML = `<p class="nota">Error: ${e.message}</p>`;
        }
    }
};

window.addEventListener('DOMContentLoaded', () => App.iniciar());
