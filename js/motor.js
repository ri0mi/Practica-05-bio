// ==========================================================================
//  MOTOR BIOINFORMÁTICO
//  Convierte una configuración ambiental en una serie temporal de mediciones,
//  un conjunto de KPIs y una lista de decisiones agronómicas.
// ==========================================================================

const Motor = {

    // Peso de cada variable en el estrés total. El agua y la temperatura
    // pesan más porque son las que matan el cultivo; la luz y los nutrientes
    // lo frenan sin llegar a tanto.
    PESOS: { hidrico: 0.32, termico: 0.30, luminico: 0.20, nutricional: 0.18 },

    UMBRAL_AVISO: 30,
    UMBRAL_CRITICO: 60,

    /**
     * Índice de estrés por variable, de 0 a 100.
     * Es la desviación absoluta respecto al óptimo de la especie, dividida
     * entre la tolerancia de esa especie para esa variable. Una tolerancia
     * grande significa que el cultivo aguanta desviaciones grandes sin sufrir.
     */
    estresDe(valor, optimo, tolerancia) {
        if (!tolerancia) return 0;
        return Math.min(100, Math.abs(valor - optimo) / tolerancia * 100);
    },

    calcularEstres(amb, esp) {
        const hidrico     = this.estresDe(amb.agua,        esp.agua_optima,       esp.tol_agua);
        const termico     = this.estresDe(amb.temperatura, esp.temp_optima,       esp.tol_temp);
        const luminico    = this.estresDe(amb.luz,         esp.luz_optima,        esp.tol_luz);
        const nutricional = this.estresDe(amb.nutrientes,  esp.nutrientes_optimo, esp.tol_nutrientes);

        const ponderado = hidrico     * this.PESOS.hidrico
                        + termico     * this.PESOS.termico
                        + luminico    * this.PESOS.luminico
                        + nutricional * this.PESOS.nutricional;

        // Ley del mínimo de Liebig: el factor más limitante gobierna el
        // crecimiento. Un promedio ponderado solo diluiría una variable letal
        // (temperatura de 45 °C con todo lo demás perfecto saldría en 30/100),
        // así que el total nunca baja del 65 % de la peor variable.
        const peor = Math.max(hidrico, termico, luminico, nutricional);
        const total = Math.max(ponderado, peor * 0.65);

        return {
            hidrico:     +hidrico.toFixed(2),
            termico:     +termico.toFixed(2),
            luminico:    +luminico.toFixed(2),
            nutricional: +nutricional.toFixed(2),
            total:       +total.toFixed(2)
        };
    },

    /**
     * El CO₂ no genera estrés: modifica la capacidad de carga.
     * Más CO₂ del óptimo fertiliza y sube el techo de biomasa; menos lo baja.
     * El efecto se acota entre −30 % y +25 %, que es el rango razonable
     * reportado para enriquecimiento en invernadero.
     */
    kEfectiva(k, co2, co2Optimo, estresTotal = 0) {
        const factorCo2 = 1 + 0.25 * (co2 - co2Optimo) / co2Optimo;

        // El estrés no solo retrasa: también recorta el rendimiento final.
        // Un tomate con déficit hídrico no tarda más en dar lo mismo, da menos.
        // Con estrés 100 la capacidad de carga cae al 55 %.
        const factorEstres = 1 - 0.45 * estresTotal / 100;

        return k * Math.min(1.25, Math.max(0.70, factorCo2)) * factorEstres;
    },

    /**
     * El estrés no cambia el techo, cambia la velocidad: una planta estresada
     * tarda más en llegar al mismo tamaño. Con estrés 100 la tasa cae al 15 %.
     */
    rEfectiva(r, estresTotal) {
        return r * (1 - 0.85 * estresTotal / 100);
    },

    /**
     * Morfología a partir de la biomasa.
     * La fracción de capacidad de carga ya alcanzada gobierna todo lo visible:
     * altura, número de hojas y número de ramas. Los exponentes hacen que la
     * altura corra por delante de la biomasa (la planta se estira antes de
     * engordar) y que las hojas aparezcan antes que las ramas.
     */
    morfologia(fraccion, esp) {
        const f = Math.min(1, Math.max(0, fraccion));
        return {
            altura:  +(esp.altura_max_u * Math.pow(f, 0.75)).toFixed(3),
            n_hojas: Math.round(Math.pow(f, 0.6) * 18),
            n_ramas: Math.round(Math.pow(f, 0.5) * esp.n_ramas)
        };
    },

    /**
     * Ejecuta la simulación completa día por día.
     * Devuelve la serie de mediciones, los agregados y las decisiones.
     */
    simular(cfg) {
        const esp = cfg.especie;
        const estres = this.calcularEstres(cfg, esp);
        const K  = this.kEfectiva(cfg.k, cfg.co2, esp.co2_optimo, estres.total);
        const r  = this.rEfectiva(cfg.r, estres.total);
        const N0 = Math.max(0.001, +esp.biomasa_inicial);

        const modelo = Modelos[cfg.modelo] ? cfg.modelo : 'logistico';
        const params = { N0, K, r, dias: cfg.dias };

        const mediciones = [];
        let diasAMadurez = null;
        let sumaIcr = 0;

        for (let dia = 0; dia <= cfg.dias; dia++) {
            const biomasa = Math.max(0, Modelos[modelo](dia, params));
            const morf = this.morfologia(biomasa / K, esp);

            // Índice de crecimiento relativo: cuánto crece por unidad de lo
            // que ya tiene. ICR = (ln B₂ − ln B₁) / (t₂ − t₁)
            let icr = 0;
            if (dia > 0) {
                const anterior = mediciones[dia - 1].biomasa;
                if (anterior > 0 && biomasa > 0) {
                    icr = (Math.log(biomasa) - Math.log(anterior)) / 1;
                }
            }
            sumaIcr += icr;

            if (diasAMadurez === null && biomasa >= 0.95 * K) {
                diasAMadurez = dia;
            }

            mediciones.push({
                dia,
                biomasa: +biomasa.toFixed(3),
                altura: morf.altura,
                n_hojas: morf.n_hojas,
                n_ramas: morf.n_ramas,
                estres_hidrico: estres.hidrico,
                estres_termico: estres.termico,
                estres_luminico: estres.luminico,
                estres_nutricional: estres.nutricional,
                estres_total: estres.total,
                icr: +icr.toFixed(5)
            });
        }

        const ultima = mediciones[mediciones.length - 1];
        const diasRef = diasAMadurez || cfg.dias;

        const resumen = {
            biomasa_final: +ultima.biomasa.toFixed(2),
            altura_final: ultima.altura,
            hojas_final: ultima.n_hojas,
            ramas_final: ultima.n_ramas,
            dias_a_madurez: diasAMadurez,
            estres_promedio: estres.total,
            icr_promedio: +(sumaIcr / cfg.dias).toFixed(5),
            eficiencia: +(ultima.biomasa / diasRef).toFixed(4),
            k_efectiva: +K.toFixed(2),
            r_efectiva: +r.toFixed(4)
        };

        return {
            config: cfg,
            estres,
            mediciones,
            resumen,
            decisiones: this.decidir(cfg, esp, estres, resumen)
        };
    },

    /**
     * Motor de decisiones. Traduce los índices de estrés en acciones concretas
     * y contesta las tres preguntas de la práctica: qué corregir, cuándo regar
     * y cuántos días faltan para la cosecha.
     */
    decidir(cfg, esp, estres, resumen) {
        const d = [];

        const severidad = v => v >= this.UMBRAL_CRITICO ? 'critico'
                             : v >= this.UMBRAL_AVISO   ? 'aviso'
                             : null;

        const revisar = (valorEstres, tipo, actual, optimo, unidad, nombre) => {
            const sev = severidad(valorEstres);
            if (!sev) return;

            const direccion = actual < optimo ? 'por debajo' : 'por encima';
            const delta = Math.abs(actual - optimo).toFixed(1);

            d.push({
                dia: 0,
                tipo,
                severidad: sev,
                mensaje: `${nombre} ${delta} ${unidad} ${direccion} del óptimo de ${esp.nombre_comun}. `
                       + `Índice de estrés ${valorEstres.toFixed(0)}/100.`,
                valor_sugerido: `${nombre.toLowerCase()}: ${optimo} ${unidad}`
            });
        };

        revisar(estres.hidrico,     'riego',       cfg.agua,        esp.agua_optima,       '%',   'Humedad');
        revisar(estres.termico,     'temperatura', cfg.temperatura, esp.temp_optima,       '°C',  'Temperatura');
        revisar(estres.luminico,    'luz',         cfg.luz,         esp.luz_optima,        '%',   'Luz');
        revisar(estres.nutricional, 'nutricion',   cfg.nutrientes,  esp.nutrientes_optimo, '%',   'Nutrientes');

        // CO₂: no estresa, pero conviene avisar si está limitando el techo
        if (cfg.co2 < esp.co2_optimo * 0.85) {
            d.push({
                dia: 0, tipo: 'co2', severidad: 'aviso',
                mensaje: `El CO₂ bajo recorta la capacidad de carga a ${resumen.k_efectiva} g.`,
                valor_sugerido: `co2: ${esp.co2_optimo} ppm`
            });
        }

        if (d.length === 0) {
            d.push({
                dia: 0, tipo: 'general', severidad: 'info',
                mensaje: `Condiciones dentro del rango óptimo para ${esp.nombre_cientifico}.`,
                valor_sugerido: null
            });
        }

        if (resumen.dias_a_madurez !== null) {
            d.push({
                dia: resumen.dias_a_madurez, tipo: 'cosecha', severidad: 'info',
                mensaje: `Alcanza el 95 % de la capacidad de carga el día ${resumen.dias_a_madurez}.`,
                valor_sugerido: `cosechar día ${resumen.dias_a_madurez}`
            });
        } else {
            d.push({
                dia: cfg.dias, tipo: 'cosecha', severidad: 'aviso',
                mensaje: `No alcanza la madurez en ${cfg.dias} días con estas condiciones. `
                       + `Alargar el ciclo o corregir el ambiente.`,
                valor_sugerido: `ciclo > ${cfg.dias} días`
            });
        }

        return d;
    },

    /**
     * Próxima acción recomendada en el día que se esté viendo.
     * Es lo que muestra el tablero de KPIs.
     */
    proximaAccion(sim, diaActual) {
        const criticas = sim.decisiones.filter(x => x.severidad === 'critico');
        if (criticas.length) return criticas[0];

        const avisos = sim.decisiones.filter(x => x.severidad === 'aviso');
        if (avisos.length) return avisos[0];

        const madurez = sim.resumen.dias_a_madurez;
        if (madurez !== null && diaActual < madurez) {
            return {
                tipo: 'cosecha', severidad: 'info',
                mensaje: `Faltan ${madurez - diaActual} días para la cosecha.`
            };
        }

        return { tipo: 'general', severidad: 'info', mensaje: 'Sin acciones pendientes.' };
    },

    /**
     * Contribución de una parte de la planta a la biomasa total.
     * Reparto agronómico aproximado: el tallo sostiene, las hojas producen y
     * las flores acumulan. Se usa en el panel de información al seleccionar.
     */
    CONTRIBUCION: {
        // El orden importa: se devuelve la PRIMERA clave que sea prefijo del
        // nombre, así que lo específico va antes que lo general
        // ('Tallo principal' antes que 'Tallo', 'Pétalo exterior' antes que 'Pétalo').
        'Tallo principal': 0.26,
        'Macollo': 0.10,
        'Segmento del tallo': 0.05,
        'Tallo': 0.10,
        'Rama': 0.07,

        'Hoja acintada': 0.05,
        'Hoja del cogollo': 0.06,
        'Hoja externa': 0.07,
        'Hoja lineal': 0.035,
        'Hoja de la roseta': 0.05,
        'Hoja': 0.04,
        'Folíolo': 0.016,

        // Órganos de cosecha: es donde se acumula el grueso del rendimiento
        'Mazorca': 0.13,
        'Espiga': 0.07,
        'Grano': 0.005,
        'Arista': 0.001,
        'Fruto': 0.07,
        'Vaina': 0.05,
        'Silicua': 0.004,

        'Centro de la flor': 0.012,
        'Pétalo exterior': 0.012,
        'Pétalo interior': 0.010,
        'Pétalo': 0.004,
        'Flor': 0.012,
        'Penacho': 0.03,
        'Espiguilla del penacho': 0.004,
        'Estigmas': 0.004,
        'Bráctea': 0.012,
        'Sépalo': 0.003,
        'Nudo del tallo': 0.006,

        // Lo que no es planta no aporta biomasa
        'Guía': 0,
        'Maceta': 0,
        'Borde de la maceta': 0,
        'Sustrato': 0
    },

    contribucionDe(nombreParte, biomasaTotal) {
        const clave = Object.keys(this.CONTRIBUCION)
            .find(k => nombreParte.startsWith(k));

        if (clave === undefined) return null;

        return +(this.CONTRIBUCION[clave] * biomasaTotal).toFixed(2);
    }
};
