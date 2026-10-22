// ==========================================================================
//  ESCENA 3D — Laboratorio de cultivo
//
//  Cada especie tiene su propia silueta, no una planta genérica repintada.
//  La forma la decide la columna "forma" de la tabla especies, así que añadir
//  una especie nueva a la base basta para que la escena sepa dibujarla.
//
//  Además, un mismo ejemplar se puede repetir en 1 a 4 macetas para ver la
//  parcela completa. Todas crecen con el mismo reloj del motor.
// ==========================================================================

const Escena = {

    FIN_TALLO: 0.40,   // el tallo termina de crecer al 40 % del avance global

    // Colocación de las macetas según cuántas haya. El escalón en Z evita que
    // queden en fila recta, que se ve artificial desde la cámara por defecto.
    REJILLA: {
        1: { x: [0],                      z: [0] },
        2: { x: [-0.75, 0.75],            z: [0.10, -0.10] },
        3: { x: [-1.40, 0, 1.40],         z: [0.25, -0.30, 0.25] },
        4: { x: [-2.00, -0.68, 0.68, 2.0], z: [0.30, -0.25, 0.30, -0.25] }
    },

    // Con más macetas hay que encoger y alejarse para que quepan.
    ESCALA_REJILLA: { 1: 1.00, 2: 0.95, 3: 0.88, 4: 0.82 },

    plantas: {},        // { actual: {...} }  o  { A: {...}, B: {...} }
    seleccionables: [],
    onSeleccion: null,  // callback que app.js conecta con el panel
    macetasActuales: 1,

    // ----------------------------------------------------------------------
    // Shader de las hojas: viento por vértice y degradado de crecimiento.
    // Viene de la Práctica 04; aquí además el color maduro lo define la especie.
    // ----------------------------------------------------------------------
    VERTEX_HOJA: `
        uniform float uTiempo;
        uniform float uViento;
        varying vec3 vNormalMundo;
        varying float vPunta;

        void main() {
            vec3 p = position;
            vec4 mundo = modelMatrix * vec4(position, 1.0);

            float peso = clamp(abs(position.z) / 0.25, 0.0, 1.0);
            p.x += sin(uTiempo * 2.3 + mundo.x * 2.0 + mundo.y * 1.4) * 0.09 * uViento * peso;
            p.y += cos(uTiempo * 1.7 + mundo.z * 2.5) * 0.05 * uViento * peso;

            vNormalMundo = normalize(mat3(modelMatrix) * normal);
            vPunta = clamp(position.z / 0.25 * 0.5 + 0.5, 0.0, 1.0);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
    `,

    FRAGMENT_HOJA: `
        uniform vec3  uColorMaduro;
        uniform vec3  uColorTierno;
        uniform vec3  uColorEstres;
        uniform float uProgreso;
        uniform float uEstres;
        uniform float uSeleccion;
        varying vec3 vNormalMundo;
        varying float vPunta;

        void main() {
            // La hoja madura de verde tierno al color de la especie...
            vec3 base = mix(uColorTierno, uColorMaduro, uProgreso);
            base = mix(base, uColorTierno, (1.0 - uProgreso) * vPunta * 0.6);

            // ...y si hay estrés, vira hacia el amarillo de la clorosis.
            base = mix(base, uColorEstres, uEstres * 0.75);

            vec3 luz = normalize(vec3(-0.5, 1.0, 0.45));
            float dif = max(dot(normalize(vNormalMundo), luz), 0.0);

            vec3 color = base * (0.45 + 0.8 * dif);
            color += uSeleccion * vec3(0.30, 0.26, 0.10);

            gl_FragColor = vec4(color, 1.0);
        }
    `,

    // ----------------------------------------------------------------------
    // 1. Montaje
    // ----------------------------------------------------------------------
    iniciar(lienzo) {
        this.escena = new THREE.Scene();
        this.escena.background = new THREE.Color(0x11161c);
        this.escena.fog = new THREE.Fog(0x11161c, 12, 28);

        this.camara = new THREE.PerspectiveCamera(
            48, lienzo.clientWidth / lienzo.clientHeight, 0.1, 100
        );
        this.CAM_UNO = new THREE.Vector3(2.2, 2.6, 5.4);
        this.CAM_AB  = new THREE.Vector3(0.3, 2.3, 5.0);
        this.OBJ_UNO = new THREE.Vector3(0, 1.5, 0);
        this.OBJ_AB  = new THREE.Vector3(0, 1.15, 0);
        this.camara.position.copy(this.CAM_UNO);

        this.renderizador = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
        this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderizador.shadowMap.enabled = true;
        this.renderizador.shadowMap.type = THREE.PCFSoftShadowMap;

        this.controles = new THREE.OrbitControls(this.camara, lienzo);
        this.controles.enableDamping = true;
        this.controles.dampingFactor = 0.08;
        this.controles.minDistance = 2;
        this.controles.maxDistance = 20;
        this.controles.maxPolarAngle = Math.PI / 2 - 0.04;
        this.controles.target.copy(this.OBJ_UNO);

        this.luces();
        this.mesa();

        this.rayo = new THREE.Raycaster();
        this.puntero = new THREE.Vector2();
        this.seleccionado = null;
        this.conectarRaycasting(lienzo);

        this.reloj = new THREE.Clock();
        this.tiempo = 0;
        this.viento = 0.6;
        this.lienzo = lienzo;

        this.redimensionar();
        window.addEventListener('resize', () => this.redimensionar());

        this.animar();
    },

    luces() {
        this.escena.add(new THREE.AmbientLight(0xdfe9ff, 0.45));

        const lampara = new THREE.DirectionalLight(0xfff4e0, 1.15);
        lampara.position.set(4, 8, 5);
        lampara.castShadow = true;
        lampara.shadow.mapSize.set(1024, 1024);
        lampara.shadow.camera.left = -8;
        lampara.shadow.camera.right = 8;
        lampara.shadow.camera.top = 8;
        lampara.shadow.camera.bottom = -4;
        this.escena.add(lampara);

        const relleno = new THREE.PointLight(0x7fb4ff, 0.45, 26);
        relleno.position.set(-5, 3, -3);
        this.escena.add(relleno);
    },

    mesa() {
        const piso = new THREE.Mesh(
            new THREE.PlaneGeometry(30, 30),
            new THREE.MeshStandardMaterial({ color: 0x1c242e, roughness: 0.95 })
        );
        piso.rotation.x = -Math.PI / 2;
        piso.receiveShadow = true;
        this.escena.add(piso);

        // Rejilla de laboratorio: da escala sin robar atención
        const rejilla = new THREE.GridHelper(24, 24, 0x2e3d4d, 0x222c36);
        rejilla.position.y = 0.002;
        this.escena.add(rejilla);
    },

    // ======================================================================
    // 2. FÁBRICA DE PLANTAS
    // ======================================================================

    /**
     * Crea el conjunto de una especie: de 1 a 4 macetas con el mismo ejemplar.
     *
     * cfg lleva lo que devuelve la API para la especie (forma, colores,
     * n_ramas) más lo que decide la interfaz (macetas, x, escala, etiqueta).
     */
    crearPlanta(id, cfg) {
        this.eliminarPlanta(id);

        const nMacetas = Math.max(1, Math.min(4, parseInt(cfg.macetas, 10) || 1));
        const rejilla  = this.REJILLA[nMacetas];
        const escalaRejilla = this.ESCALA_REJILLA[nMacetas];

        const raiz = new THREE.Group();
        raiz.position.set(cfg.x || 0, 0, 0);
        raiz.scale.setScalar((cfg.escala || 1) * escalaRejilla);
        this.escena.add(raiz);

        const materialesHoja = [];
        const copias = [];

        for (let k = 0; k < nMacetas; k++) {
            const copia = this.construirEjemplar(id, cfg, k, nMacetas, materialesHoja);

            copia.maceta.position.set(rejilla.x[k], 0, rejilla.z[k]);
            // Un poco de variación para que no parezcan calcadas.
            copia.maceta.rotation.y = k * 1.27;
            copia.maceta.scale.setScalar(1 + ((k % 2) ? -0.04 : 0.04));

            raiz.add(copia.maceta);
            copias.push(copia);
        }

        this.plantas[id] = {
            raiz, copias, materialesHoja,
            crecimiento: 0, estres: 0,
            macetas: nMacetas,
            alturaMax: cfg.altura_max_u || 2.0
        };

        if (id === 'actual') this.macetasActuales = nMacetas;

        return this.plantas[id];
    },

    /**
     * Construye UN ejemplar completo: maceta, sustrato y la planta encima.
     * La silueta la elige cfg.forma; si llega una desconocida se usa el
     * arbusto, que es la forma más neutra.
     */
    construirEjemplar(id, cfg, indice, total, materialesHoja) {
        const colorHoja   = new THREE.Color(cfg.color_hoja   || '#7f9a3c');
        const colorPetalo = new THREE.Color(cfg.color_petalo || '#ff8c2b');

        const mat = {
            tallo:   new THREE.MeshStandardMaterial({ color: 0x5c7a3a, roughness: 0.82 }),
            tallo2:  new THREE.MeshStandardMaterial({ color: 0x6d8a46, roughness: 0.85 }),
            maceta:  new THREE.MeshStandardMaterial({ color: 0xb4623a, roughness: 0.8 }),
            borde:   new THREE.MeshStandardMaterial({ color: 0x9c4f2d, roughness: 0.75 }),
            tierra:  new THREE.MeshStandardMaterial({ color: 0x3d2b1c, roughness: 1.0 }),
            petalo:  new THREE.MeshStandardMaterial({ color: colorPetalo, roughness: 0.55 }),
            petalo2: new THREE.MeshStandardMaterial({
                        color: new THREE.Color(colorPetalo).multiplyScalar(0.82), roughness: 0.6 }),
            centro:  new THREE.MeshStandardMaterial({
                        color: new THREE.Color(colorPetalo).lerp(new THREE.Color(0xffe9a8), 0.6),
                        roughness: 0.5 }),
            grano:   new THREE.MeshStandardMaterial({ color: 0xd9b24c, roughness: 0.6 }),
            arista:  new THREE.MeshStandardMaterial({ color: 0xc9bb7a, roughness: 0.7 }),
            fruto:   new THREE.MeshStandardMaterial({ color: 0xcf3b24, roughness: 0.42 }),
            vaina:   new THREE.MeshStandardMaterial({ color: 0x86a63f, roughness: 0.6 }),
            bractea: new THREE.MeshStandardMaterial({ color: 0x7f9a3c, roughness: 0.85 })
        };

        const etiqueta = (cfg.etiqueta || '') +
                         (total > 1 ? ` · maceta ${indice + 1}` : '');

        const tallosInfo = [], ramasInfo = [], hojasInfo = [], organosInfo = [];

        const registrar = (malla, nombre, geometria, funcion) => {
            malla.userData = {
                planta: id, nombre: nombre + etiqueta,
                nombreBase: nombre, geometria, funcion, progreso: 1
            };
            malla.castShadow = true;
            this.seleccionables.push(malla);
            return malla;
        };

        // ---- Maceta (no crece) ----
        const maceta = new THREE.Group();
        const cuenco = new THREE.Group();
        cuenco.scale.setScalar(0.55);
        maceta.add(cuenco);

        const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.62, 1.2, 24), mat.maceta);
        cuerpo.position.y = 0.6;
        cuerpo.receiveShadow = true;
        cuenco.add(cuerpo);
        registrar(cuerpo, 'Maceta', 'CylinderGeometry', 'Contiene el sustrato. Es el padre de toda la jerarquía.');

        const borde = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.075, 8, 28), mat.borde);
        borde.position.y = 1.2;
        borde.rotation.x = Math.PI / 2;
        cuenco.add(borde);
        registrar(borde, 'Borde de la maceta', 'TorusGeometry', 'Refuerza el filo superior de la maceta.');

        const tierra = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 24), mat.tierra);
        tierra.position.y = 1.16;
        tierra.receiveShadow = true;
        cuenco.add(tierra);
        registrar(tierra, 'Sustrato', 'CylinderGeometry', 'Donde se anclan las raíces. De aquí sale el tallo.');

        // ---- La planta cuelga de la maceta ----
        const planta = new THREE.Group();
        planta.position.y = 0.67;   // superficie del sustrato
        maceta.add(planta);

        // ------------------------------------------------------------------
        // Herramientas compartidas por todas las siluetas
        // ------------------------------------------------------------------
        const h = {
            planta, mat, registrar, colorHoja,
            tallosInfo, ramasInfo, hojasInfo, organosInfo,
            fase: indice * 0.9,

            /** Cilindro con el origen en su base, listo para escalar en Y. */
            tallo(padre, { alto, rBase, rPunta, material, nombre, funcion, t0, t1 }) {
                const geo = new THREE.CylinderGeometry(rPunta, rBase, alto, 10);
                geo.translate(0, alto / 2, 0);
                const m = new THREE.Mesh(geo, material || mat.tallo);
                padre.add(m);
                registrar(m, nombre, 'CylinderGeometry', funcion);
                tallosInfo.push({ malla: m, t0, t1, alto });
                return m;
            },

            /** Material de hoja nuevo (cada hoja lleva el suyo por el shader). */
            matHoja() {
                const m = new THREE.ShaderMaterial({
                    uniforms: {
                        uTiempo:      { value: 0 },
                        uViento:      { value: 0.6 },
                        uProgreso:    { value: 0 },
                        uEstres:      { value: 0 },
                        uSeleccion:   { value: 0 },
                        uColorMaduro: { value: colorHoja.clone() },
                        uColorTierno: { value: new THREE.Color(0xd9e28c) },
                        uColorEstres: { value: new THREE.Color(0xd8b24a) }
                    },
                    vertexShader: Escena.VERTEX_HOJA,
                    fragmentShader: Escena.FRAGMENT_HOJA
                });
                materialesHoja.push(m);
                return m;
            },

            /**
             * Hoja genérica. La esfera base se deforma con la escala final:
             * ancha y corta da hoja de arbusto, estrecha y larga da hoja de
             * gramínea. Es la misma geometría para todas, cambia la proporción.
             */
            hoja(padre, { ancho = 1, grosor = 0.28, largo = 0.62,
                          t0, t1, nombre = 'Hoja', funcion }) {
                const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), h.matHoja());
                padre.add(m);
                registrar(m, nombre, 'SphereGeometry + ShaderMaterial',
                    funcion || 'Capta la luz y hace la fotosíntesis. Madura con el crecimiento y amarillea con el estrés.');
                hojasInfo.push({
                    malla: m,
                    escalaFinal: new THREE.Vector3(ancho, grosor, largo),
                    t0, t1
                });
                return m;
            },

            /**
             * Órgano que aparece entero y crece de golpe: una flor, una
             * espiga, un fruto, una vaina. Se registra como grupo para poder
             * escalarlo desde cero sin tocar sus piezas.
             */
            organo(padre, { escala = 1, t0, t1 }) {
                const g = new THREE.Group();
                g.scale.setScalar(0.001);
                padre.add(g);
                const registro = { grupo: g, escala, mallas: [], t0, t1 };
                organosInfo.push(registro);
                return { grupo: g, pieza: (malla, nombre, geo, funcion) => {
                    registrar(malla, nombre, geo, funcion);
                    registro.mallas.push(malla);
                    return malla;
                } };
            }
        };

        // ------------------------------------------------------------------
        // Selección de silueta
        // ------------------------------------------------------------------
        const formas = {
            maiz:         () => this.formaMaiz(h, cfg),
            trigo:        () => this.formaTrigo(h, cfg),
            tomate:       () => this.formaTomate(h, cfg),
            frijol:       () => this.formaFrijol(h, cfg),
            roseta:       () => this.formaLechuga(h, cfg),
            arabidopsis:  () => this.formaArabidopsis(h, cfg)
        };

        (formas[cfg.forma] || formas.tomate)();

        return { maceta, planta, tallosInfo, ramasInfo, hojasInfo, organosInfo };
    },

    // ----------------------------------------------------------------------
    // 2.1  MAÍZ — Zea mays
    //      Un solo tallo grueso con nudos, hojas acintadas alternas que
    //      cuelgan, penacho (la inflorescencia masculina) en la punta y una
    //      mazorca envuelta en brácteas a media altura.
    // ----------------------------------------------------------------------
    formaMaiz(h, cfg) {
        const ALTO = 2.8;

        h.tallo(h.planta, {
            alto: ALTO, rBase: 0.085, rPunta: 0.05,
            nombre: 'Tallo principal',
            funcion: 'Caña única del maíz. No se ramifica: toda la planta cuelga de ella.',
            t0: 0, t1: this.FIN_TALLO
        });

        // Nudos: marcan dónde nace cada hoja
        const alturas = [0.35, 0.70, 1.05, 1.45, 1.85, 2.25];

        alturas.forEach((y, i) => {
            const nace = (y / ALTO) * this.FIN_TALLO;

            // El nudo se registra como órgano para que aparezca cuando la caña
            // llega a su altura. Si se añadiera suelto quedaría flotando en el
            // aire desde el día 0, antes de que exista el tallo que lo sostiene.
            const org = h.organo(h.planta, { escala: 1, t0: nace, t1: nace + 0.05 });
            org.grupo.position.y = y;

            const nudo = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12), h.mat.tallo2);
            nudo.rotation.x = Math.PI / 2;
            org.grupo.add(nudo);
            org.pieza(nudo, 'Nudo del tallo', 'TorusGeometry',
                'Punto de inserción de la hoja. En las gramíneas el tallo crece desde aquí.');

            const pivote = new THREE.Group();
            // Hojas dísticas: alternas y a 180°, como en todas las gramíneas.
            // El desfase de 1.6 rad orienta ese plano de izquierda a derecha
            // de la cámara; si no, las hojas apuntan hacia el observador y se
            // ven en escorzo, como simples bultos sobre la caña.
            pivote.position.y = y;
            pivote.rotation.y = i * Math.PI + 1.6 + (i % 4) * 0.12;
            pivote.rotation.x = -0.12;
            h.planta.add(pivote);

            // Hoja larga y estrecha, arqueada hacia abajo por la inclinación
            const hoja = h.hoja(pivote, {
                ancho: 0.62, grosor: 0.1, largo: 3.4 - i * 0.22,
                t0: nace, t1: nace + 0.14,
                nombre: 'Hoja acintada',
                funcion: 'Hoja de gramínea: larga, estrecha y con nervadura paralela. Se arquea por su propio peso.'
            });
            hoja.position.set(0, 0.02, 0.30);
            hoja.rotation.x = 0.55;
        });

        // ---- Penacho terminal ----
        const penacho = h.organo(h.planta, { escala: 1, t0: 0.55, t1: 0.80 });
        penacho.grupo.position.y = ALTO;

        const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.5, 6), h.mat.tallo2);
        eje.position.y = 0.25;
        penacho.grupo.add(eje);
        penacho.pieza(eje, 'Penacho', 'CylinderGeometry',
            'Inflorescencia masculina. Libera el polen que fecunda los estigmas de la mazorca.');

        for (let i = 0; i < 6; i++) {
            const rama = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 5), h.mat.arista);
            rama.position.y = 0.21;
            const pivote = new THREE.Group();
            pivote.rotation.y = (i / 6) * Math.PI * 2;
            pivote.rotation.z = 0.45;
            pivote.position.y = 0.30;
            pivote.add(rama);
            penacho.grupo.add(pivote);
            penacho.pieza(rama, 'Espiguilla del penacho', 'CylinderGeometry',
                'Rama del penacho. Cada una lleva decenas de anteras.');
        }

        // ---- Mazorca ----
        const mazorca = h.organo(h.planta, { escala: 1, t0: 0.70, t1: 0.95 });
        mazorca.grupo.position.set(0, 1.25, 0);
        mazorca.grupo.rotation.z = -0.55;
        mazorca.grupo.rotation.y = 1.1;

        const grano = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.52, 12), h.mat.grano);
        grano.position.set(0, 0, 0.18);
        grano.rotation.x = 1.25;
        mazorca.grupo.add(grano);
        mazorca.pieza(grano, 'Mazorca', 'CylinderGeometry',
            'Inflorescencia femenina ya cuajada. Es el órgano de cosecha del maíz.');

        for (let i = 0; i < 4; i++) {
            const bractea = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), h.mat.bractea);
            bractea.scale.set(0.5, 0.22, 2.9);
            const pivote = new THREE.Group();
            pivote.rotation.z = (i / 4) * Math.PI * 2;
            bractea.position.set(0, 0.06, 0.2);
            bractea.rotation.x = 1.25;
            pivote.add(bractea);
            mazorca.grupo.add(pivote);
            mazorca.pieza(bractea, 'Bráctea', 'SphereGeometry (alargada)',
                'Hoja modificada que envuelve y protege la mazorca.');
        }

        const barbas = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), h.mat.arista);
        barbas.position.set(0, 0.18, 0.4);
        barbas.rotation.x = 1.0;
        mazorca.grupo.add(barbas);
        mazorca.pieza(barbas, 'Estigmas', 'ConeGeometry',
            'Los "pelos" de la mazorca. Cada uno conduce el polen hasta un grano.');
    },

    // ----------------------------------------------------------------------
    // 2.2  TRIGO — Triticum aestivum
    //      Mata de varios macollos delgados, hojas estrechas erectas y una
    //      espiga de granos con aristas en cada punta.
    // ----------------------------------------------------------------------
    formaTrigo(h, cfg) {
        const MACOLLOS = [
            { x:  0.00, z:  0.00, alto: 2.25, inc: 0.00 },
            { x: -0.16, z:  0.10, alto: 1.95, inc: 0.16 },
            { x:  0.15, z: -0.09, alto: 2.05, inc: -0.14 },
            { x:  0.02, z:  0.18, alto: 1.75, inc: 0.10 }
        ];

        MACOLLOS.forEach((d, i) => {
            const grupo = new THREE.Group();
            grupo.position.set(d.x, 0, d.z);
            grupo.rotation.z = d.inc;
            grupo.rotation.y = i * 1.4;
            h.planta.add(grupo);

            const esPrincipal = i === 0;

            h.tallo(grupo, {
                alto: d.alto, rBase: 0.028, rPunta: 0.018,
                material: h.mat.tallo2,
                nombre: esPrincipal ? 'Tallo principal' : 'Macollo',
                funcion: esPrincipal
                    ? 'Caña central de la mata.'
                    : 'Caña secundaria nacida de la base. El macollamiento es lo que convierte una semilla en varias espigas.',
                t0: i * 0.04, t1: this.FIN_TALLO + i * 0.04
            });

            // Dos hojas estrechas y erectas por macollo
            [0.5, 1.0].forEach((y, j) => {
                const nace = (y / d.alto) * this.FIN_TALLO;
                const pivote = new THREE.Group();
                pivote.position.y = y;
                pivote.rotation.y = j * Math.PI + i;
                pivote.rotation.x = -0.55;
                grupo.add(pivote);

                const hoja = h.hoja(pivote, {
                    ancho: 0.34, grosor: 0.09, largo: 2.3,
                    t0: nace, t1: nace + 0.14,
                    nombre: 'Hoja lineal',
                    funcion: 'Hoja estrecha y erecta. Deja pasar la luz a las hojas de abajo, lo que permite sembrar denso.'
                });
                hoja.position.set(0, 0.02, 0.26);
                hoja.rotation.x = 0.25;
            });

            // ---- Espiga ----
            const t0 = 0.52 + i * 0.03;
            const espiga = h.organo(grupo, { escala: 1, t0, t1: t0 + 0.22 });
            espiga.grupo.position.y = d.alto;

            const raquis = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.46, 6), h.mat.tallo2);
            raquis.position.y = 0.23;
            espiga.grupo.add(raquis);
            espiga.pieza(raquis, 'Espiga', 'CylinderGeometry',
                'Eje de la espiga. Sostiene las espiguillas donde se forman los granos: es el órgano de cosecha.');

            for (let f = 0; f < 6; f++) {
                const y = 0.08 + f * 0.072;
                [0, Math.PI].forEach(giro => {
                    const g = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), h.mat.grano);
                    g.scale.set(0.85, 1.25, 0.85);
                    const pivote = new THREE.Group();
                    pivote.position.y = y;
                    pivote.rotation.y = giro + f * 0.3;
                    g.position.z = 0.035;
                    pivote.add(g);
                    espiga.grupo.add(pivote);
                    espiga.pieza(g, 'Grano', 'SphereGeometry',
                        'Cariópside. La suma de todos los granos es el rendimiento real del cultivo.');

                    const arista = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.26, 4), h.mat.arista);
                    arista.position.set(0, 0.17, 0.05);
                    arista.rotation.x = -0.2;
                    pivote.add(arista);
                    espiga.pieza(arista, 'Arista', 'CylinderGeometry',
                        'Filamento rígido del grano. Reduce la depredación por aves y aporta algo de fotosíntesis.');
                });
            }
        });
    },

    // ----------------------------------------------------------------------
    // 2.3  TOMATE — Solanum lycopersicum
    //      Arbusto ramificado, hoja compuesta de cinco folíolos, flores
    //      amarillas de cinco pétalos y frutos que engordan al final.
    // ----------------------------------------------------------------------
    formaTomate(h, cfg) {
        const ALTO = 2.0;
        const nRamas = Math.max(2, Math.min(4, cfg.n_ramas || 3));

        h.tallo(h.planta, {
            alto: ALTO, rBase: 0.075, rPunta: 0.045,
            nombre: 'Tallo principal',
            funcion: 'Eje central. Escala desde cero y arrastra todo lo que cuelga de él.',
            t0: 0, t1: this.FIN_TALLO
        });

        /** Hoja compuesta: un raquis con cinco folíolos. */
        const hojaCompuesta = (padre, escala, t0) => {
            const g = new THREE.Group();
            padre.add(g);

            [[-0.26, 1.15, 0.8], [0.26, -1.15, 0.8],
             [-0.16, 1.0, 0.95], [0.16, -1.0, 0.95],
             [0, 0, 1.15]].forEach((d, i) => {
                const foliolo = h.hoja(g, {
                    ancho: 0.62 * escala * d[2], grosor: 0.2 * escala, largo: 0.5 * escala * d[2],
                    t0: t0 + i * 0.012, t1: t0 + 0.15 + i * 0.012,
                    nombre: 'Folíolo',
                    funcion: 'Pieza de la hoja compuesta del tomate. Cinco de ellas forman una sola hoja.'
                });
                foliolo.position.set(d[0] * escala, 0, (0.18 + Math.abs(d[0]) * 0.5) * escala);
                foliolo.rotation.y = d[1] * 0.35;
                foliolo.rotation.x = -0.2;
            });
            return g;
        };

        // ---- Ramas ----
        const DEF = [
            { altura: 0.70, giro: 0.0, largo: 0.80, inclinacion: -0.95, fruto: true },
            { altura: 1.12, giro: 2.3, largo: 0.70, inclinacion: -0.85, fruto: false },
            { altura: 1.52, giro: 4.3, largo: 0.74, inclinacion: -0.90, fruto: true },
            { altura: 1.80, giro: 5.7, largo: 0.60, inclinacion: -0.80, fruto: true }
        ];

        DEF.slice(0, nRamas).forEach((d, i) => {
            const nace = (d.altura / ALTO) * this.FIN_TALLO;
            const finRama = nace + 0.20;

            const rama = new THREE.Group();
            rama.position.y = d.altura;
            rama.rotation.y = d.giro;
            rama.rotation.z = d.inclinacion;
            h.planta.add(rama);

            const geo = new THREE.CylinderGeometry(0.028, 0.042, d.largo, 8);
            geo.translate(0, d.largo / 2, 0);
            const palo = new THREE.Mesh(geo, h.mat.tallo);
            rama.add(palo);
            h.registrar(palo, 'Rama ' + (i + 1), 'CylinderGeometry',
                'Rama lateral. Empieza a escalar cuando el tallo llega a su altura de nacimiento.');

            const anclaMedia = new THREE.Group();
            const anclaPunta = new THREE.Group();
            rama.add(anclaMedia, anclaPunta);

            hojaCompuesta(anclaMedia, 1.0, finRama);

            if (d.fruto) {
                // Racimo: flor amarilla y, más tarde, el fruto rojo
                const flor = h.organo(anclaPunta, { escala: 0.9, t0: finRama + 0.08, t1: finRama + 0.22 });
                flor.grupo.position.y = 0.1;
                flor.grupo.quaternion.copy(rama.quaternion).invert();
                flor.grupo.rotateX(-Math.PI / 2 + 0.3);

                const centro = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), h.mat.centro);
                flor.grupo.add(centro);
                flor.pieza(centro, 'Centro de la flor', 'SphereGeometry',
                    'Cono de anteras. El tomate se autopoliniza con la vibración del aire.');

                for (let p = 0; p < 5; p++) {
                    const petalo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), h.mat.petalo);
                    petalo.scale.set(0.45, 0.22, 1.5);
                    const pivote = new THREE.Group();
                    pivote.rotation.y = (p / 5) * Math.PI * 2;
                    pivote.rotation.x = 0.5;
                    petalo.position.z = 0.09;
                    pivote.add(petalo);
                    flor.grupo.add(pivote);
                    flor.pieza(petalo, 'Pétalo', 'SphereGeometry (alargada)',
                        'Pétalo de la corola amarilla, típica de las solanáceas.');
                }

                const fruto = h.organo(anclaPunta, { escala: 1, t0: 0.74, t1: 0.96 });
                fruto.grupo.position.y = 0.06;

                const baya = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), h.mat.fruto);
                baya.scale.set(1, 0.85, 1);
                baya.position.y = -0.14;
                fruto.grupo.add(baya);
                fruto.pieza(baya, 'Fruto', 'SphereGeometry',
                    'Baya madura. Concentra buena parte de la biomasa final de la planta.');

                for (let s = 0; s < 5; s++) {
                    const sepalo = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), h.mat.bractea);
                    sepalo.scale.set(0.4, 0.2, 1.4);
                    const pivote = new THREE.Group();
                    pivote.rotation.y = (s / 5) * Math.PI * 2;
                    pivote.rotation.x = 0.9;
                    pivote.position.y = -0.04;
                    sepalo.position.z = 0.07;
                    pivote.add(sepalo);
                    fruto.grupo.add(pivote);
                    fruto.pieza(sepalo, 'Sépalo', 'SphereGeometry (alargada)',
                        'Cáliz verde que queda sobre el fruto.');
                }
            } else {
                hojaCompuesta(anclaPunta, 1.15, finRama + 0.06);
            }

            h.ramasInfo.push({
                grupo: rama, palo, largo: d.largo,
                anclaMedia, anclaPunta,
                inclinacion: d.inclinacion, fase: i * 1.7 + h.fase,
                t0: nace, t1: finRama
            });
        });

        // Hojas bajas
        [{ y: 0.40, giro: 1.0 }, { y: 0.92, giro: 3.6 }].forEach(d => {
            const nace = (d.y / ALTO) * this.FIN_TALLO;
            const pivote = new THREE.Group();
            pivote.position.y = d.y;
            pivote.rotation.y = d.giro;
            pivote.rotation.x = -0.3;
            h.planta.add(pivote);
            hojaCompuesta(pivote, 1.1, nace);
        });
    },

    // ----------------------------------------------------------------------
    // 2.4  FRIJOL — Phaseolus vulgaris
    //      Trepadora: el tallo sube enroscándose a una guía, con hojas
    //      trifoliadas en cada nudo y vainas colgando al final.
    // ----------------------------------------------------------------------
    formaFrijol(h, cfg) {
        const SEGMENTOS = 7;
        const PASO = 0.30;          // cuánto sube cada vuelta parcial
        const RADIO = 0.17;
        const ALTO = SEGMENTOS * PASO;

        // Guía: la estaca a la que se enrosca. No crece ni aporta biomasa.
        const guia = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.022, ALTO + 0.35, 8),
            new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.9 })
        );
        guia.position.y = (ALTO + 0.35) / 2;
        h.planta.add(guia);
        h.registrar(guia, 'Guía', 'CylinderGeometry',
            'Tutor de la trepadora. Es parte del manejo del cultivo, no de la planta: no aporta biomasa.');

        // Tallo en hélice: cada segmento aparece después del anterior, y eso
        // es lo que hace que la planta parezca trepar en vez de estirarse.
        for (let i = 0; i < SEGMENTOS; i++) {
            const t0 = (i / SEGMENTOS) * this.FIN_TALLO;
            const t1 = ((i + 1) / SEGMENTOS) * this.FIN_TALLO;
            const anguloA = i * 1.5;
            const anguloB = (i + 1) * 1.5;

            const a = new THREE.Vector3(Math.cos(anguloA) * RADIO, i * PASO, Math.sin(anguloA) * RADIO);
            const b = new THREE.Vector3(Math.cos(anguloB) * RADIO, (i + 1) * PASO, Math.sin(anguloB) * RADIO);

            const largo = a.distanceTo(b);
            const geo = new THREE.CylinderGeometry(0.026, 0.03, largo, 7);
            geo.translate(0, largo / 2, 0);

            const seg = new THREE.Mesh(geo, i === 0 ? h.mat.tallo : h.mat.tallo2);
            seg.position.copy(a);
            seg.lookAt(b);
            seg.rotateX(Math.PI / 2);   // lookAt apunta el eje Z; el cilindro crece en Y
            h.planta.add(seg);

            h.registrar(seg, i === 0 ? 'Tallo principal' : 'Segmento del tallo', 'CylinderGeometry',
                'Tramo del tallo volubles. El frijol se enrosca siempre en el mismo sentido, de izquierda a derecha.');
            h.tallosInfo.push({ malla: seg, t0, t1, alto: largo });

            // ---- Hoja trifoliada en el nudo ----
            const nudo = new THREE.Group();
            nudo.position.copy(b);
            nudo.rotation.y = -anguloB + 0.4;
            h.planta.add(nudo);

            [[0, 1.0, 0], [-0.5, 0.8, 0.9], [0.5, 0.8, -0.9]].forEach((d, j) => {
                const foliolo = h.hoja(nudo, {
                    ancho: 0.95, grosor: 0.2, largo: 0.78 * d[1],
                    t0: t1, t1: t1 + 0.13,
                    nombre: 'Folíolo',
                    funcion: 'Una de las tres piezas de la hoja trifoliada, el rasgo que identifica a las leguminosas.'
                });
                foliolo.position.set(d[0] * 0.26, 0.02, 0.26 + d[0] * 0.06);
                foliolo.rotation.y = d[2] * 0.5;
                foliolo.rotation.x = -0.25;
            });

            // ---- Flor y vaina en los nudos altos ----
            if (i >= 3 && i % 2 === 1) {
                const t0Flor = 0.50 + (i - 3) * 0.05;

                const flor = h.organo(nudo, { escala: 0.8, t0: t0Flor, t1: t0Flor + 0.14 });
                flor.grupo.position.set(0, -0.04, 0.12);

                const quilla = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), h.mat.petalo);
                quilla.scale.set(0.8, 0.7, 1.4);
                flor.grupo.add(quilla);
                flor.pieza(quilla, 'Flor', 'SphereGeometry',
                    'Flor papilionácea: estandarte, alas y quilla. Se autopoliniza antes de abrir.');

                const vaina = h.organo(nudo, { escala: 1, t0: 0.70 + (i - 3) * 0.03, t1: 0.94 });
                vaina.grupo.position.set(0, -0.06, 0.14);
                vaina.grupo.rotation.x = 0.9;
                vaina.grupo.rotation.z = (i % 3) * 0.4;

                const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.62, 8), h.mat.vaina);
                cuerpo.position.y = -0.3;
                cuerpo.rotation.z = 0.18;
                vaina.grupo.add(cuerpo);
                vaina.pieza(cuerpo, 'Vaina', 'CylinderGeometry',
                    'Legumbre con las semillas dentro. Es el órgano de cosecha del frijol.');
            }
        }
    },

    // ----------------------------------------------------------------------
    // 2.5  LECHUGA — Lactuca sativa
    //      Roseta: no hay tallo visible. Tres coronas de hojas cada vez más
    //      erectas y pequeñas forman el cogollo.
    // ----------------------------------------------------------------------
    formaLechuga(h, cfg) {
        // Tallo mínimo, casi oculto: en la lechuga comercial no se alarga
        // hasta que la planta se "va a flor", que es justo lo que se evita.
        h.tallo(h.planta, {
            alto: 0.22, rBase: 0.085, rPunta: 0.07,
            nombre: 'Tallo principal',
            funcion: 'Tallo comprimido. Mientras no se alargue, las hojas salen pegadas unas a otras formando la roseta.',
            t0: 0, t1: this.FIN_TALLO
        });

        const CORONAS = [
            { n: 7, radio: 0.16, y: 0.05, inc: 1.25, ancho: 1.65, largo: 1.35, t0: 0.05 },
            { n: 7, radio: 0.12, y: 0.13, inc: 0.95, ancho: 1.35, largo: 1.10, t0: 0.26 },
            { n: 6, radio: 0.08, y: 0.20, inc: 0.60, ancho: 1.05, largo: 0.85, t0: 0.46 },
            { n: 5, radio: 0.05, y: 0.26, inc: 0.28, ancho: 0.75, largo: 0.62, t0: 0.64 }
        ];

        CORONAS.forEach((c, nivel) => {
            for (let i = 0; i < c.n; i++) {
                const pivote = new THREE.Group();
                pivote.position.y = c.y;
                pivote.rotation.y = (i / c.n) * Math.PI * 2 + nivel * 0.5;
                pivote.rotation.x = -c.inc;
                h.planta.add(pivote);

                const esCogollo = nivel >= 2;
                const hoja = h.hoja(pivote, {
                    ancho: c.ancho, grosor: 0.26, largo: c.largo,
                    t0: c.t0 + i * 0.008, t1: c.t0 + 0.2 + i * 0.008,
                    nombre: esCogollo ? 'Hoja del cogollo' : 'Hoja externa',
                    funcion: esCogollo
                        ? 'Hoja interna, tierna y clara por recibir menos luz. Es la parte de más valor comercial.'
                        : 'Hoja envolvente. Capta casi toda la luz y protege al cogollo.'
                });
                hoja.position.set(0, 0, c.radio + c.largo * 0.16);
                hoja.rotation.z = (i % 2 ? 0.14 : -0.14);
            }
        });
    },

    // ----------------------------------------------------------------------
    // 2.6  ARABIDOPSIS — Arabidopsis thaliana
    //      Roseta basal pequeña y un bohordo delgado que se dispara con
    //      flores diminutas de cuatro pétalos y silicuas verticales.
    //      Es la planta modelo de la genética vegetal: pequeña y rápida.
    // ----------------------------------------------------------------------
    formaArabidopsis(h, cfg) {
        const ALTO = 1.5;

        // ---- Roseta basal ----
        for (let i = 0; i < 8; i++) {
            const pivote = new THREE.Group();
            pivote.position.y = 0.03;
            pivote.rotation.y = (i / 8) * Math.PI * 2;
            pivote.rotation.x = -1.32;          // casi tumbadas sobre el sustrato
            h.planta.add(pivote);

            const hoja = h.hoja(pivote, {
                ancho: 0.62, grosor: 0.16, largo: 0.78,
                t0: 0.02 + i * 0.01, t1: 0.20 + i * 0.01,
                nombre: 'Hoja de la roseta',
                funcion: 'Hoja basal espatulada. La roseta es lo primero que forma la planta y lo que se mide en los ensayos.'
            });
            hoja.position.set(0, 0, 0.22);
        }

        // ---- Bohordo ----
        h.tallo(h.planta, {
            alto: ALTO, rBase: 0.024, rPunta: 0.013,
            material: h.mat.tallo2,
            nombre: 'Tallo principal',
            funcion: 'Bohordo floral. Se dispara cuando la planta pasa a fase reproductiva.',
            t0: 0.18, t1: this.FIN_TALLO + 0.10
        });

        // Dos ramas finas
        [{ y: 0.65, giro: 0.6 }, { y: 0.95, giro: 3.4 }].forEach((d, i) => {
            const nace = 0.30 + i * 0.06;
            const rama = new THREE.Group();
            rama.position.y = d.y;
            rama.rotation.y = d.giro;
            rama.rotation.z = -0.65;
            h.planta.add(rama);

            const largo = 0.5;
            const geo = new THREE.CylinderGeometry(0.009, 0.013, largo, 6);
            geo.translate(0, largo / 2, 0);
            const palo = new THREE.Mesh(geo, h.mat.tallo2);
            rama.add(palo);
            h.registrar(palo, 'Rama ' + (i + 1), 'CylinderGeometry',
                'Rama del bohordo. También termina en un racimo de flores.');

            const anclaPunta = new THREE.Group();
            rama.add(anclaPunta);

            h.ramasInfo.push({
                grupo: rama, palo, largo,
                anclaMedia: null, anclaPunta,
                inclinacion: -0.65, fase: i * 2.1 + h.fase,
                t0: nace, t1: nace + 0.16
            });

            this.racimoArabidopsis(h, anclaPunta, 0.55 + i * 0.05, 0.75);
        });

        // Racimo terminal
        const punta = new THREE.Group();
        punta.position.y = ALTO;
        h.planta.add(punta);
        this.racimoArabidopsis(h, punta, 0.52, 1.0);
    },

    /** Racimo de Arabidopsis: flores de 4 pétalos y silicuas alargadas. */
    racimoArabidopsis(h, padre, t0, escala) {
        const flor = h.organo(padre, { escala, t0, t1: t0 + 0.16 });
        flor.grupo.position.y = 0.06;

        for (let f = 0; f < 3; f++) {
            const sub = new THREE.Group();
            sub.position.y = f * 0.07;
            sub.rotation.y = f * 2.1;
            flor.grupo.add(sub);

            const centro = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), h.mat.centro);
            sub.add(centro);
            flor.pieza(centro, 'Centro de la flor', 'SphereGeometry',
                'Gineceo con seis estambres. La autopolinización es lo que hace a esta especie tan cómoda en genética.');

            for (let p = 0; p < 4; p++) {     // cruciferae: cuatro pétalos en cruz
                const petalo = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), h.mat.petalo);
                petalo.scale.set(0.6, 0.25, 1.4);
                const pivote = new THREE.Group();
                pivote.rotation.y = (p / 4) * Math.PI * 2;
                pivote.rotation.x = 0.35;
                petalo.position.z = 0.028;
                pivote.add(petalo);
                sub.add(pivote);
                flor.pieza(petalo, 'Pétalo', 'SphereGeometry (alargada)',
                    'Pétalo blanco dispuesto en cruz, el rasgo que da nombre a las crucíferas.');
            }
        }

        const silicuas = h.organo(padre, { escala, t0: t0 + 0.18, t1: t0 + 0.38 });
        silicuas.grupo.position.y = 0.02;

        for (let s = 0; s < 5; s++) {
            const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.2, 5), h.mat.vaina);
            const pivote = new THREE.Group();
            pivote.rotation.y = (s / 5) * Math.PI * 2 + 0.5;
            pivote.rotation.z = -0.5;
            pivote.position.y = -0.03 - s * 0.012;
            sil.position.set(0, 0.1, 0.03);
            pivote.add(sil);
            silicuas.grupo.add(pivote);
            silicuas.pieza(sil, 'Silicua', 'CylinderGeometry',
                'Fruto seco y alargado con las semillas en fila. Una sola planta produce miles.');
        }
    },

    // ----------------------------------------------------------------------
    // 3. Borrado
    // ----------------------------------------------------------------------
    eliminarPlanta(id) {
        const p = this.plantas[id];
        if (!p) return;

        this.escena.remove(p.raiz);
        p.raiz.traverse(o => {
            if (o.isMesh) {
                o.geometry.dispose();
                if (o.material.dispose) o.material.dispose();
            }
        });

        this.seleccionables = this.seleccionables.filter(m => m.userData.planta !== id);
        if (this.seleccionado && this.seleccionado.userData.planta === id) {
            this.seleccionado = null;
        }

        delete this.plantas[id];
    },

    limpiar() {
        Object.keys(this.plantas).forEach(id => this.eliminarPlanta(id));
    },

    // ----------------------------------------------------------------------
    // 4. Crecimiento: lo manda el motor
    // ----------------------------------------------------------------------
    setCrecimiento(id, fraccion, estres = 0) {
        const p = this.plantas[id];
        if (!p) return;
        p.crecimiento = Math.min(1, Math.max(0, fraccion));
        p.estres = Math.min(1, Math.max(0, estres / 100));
    },

    /** Progreso suavizado de una etapa dentro del avance global. */
    etapa(crecimiento, t0, t1) {
        const p = Math.min(Math.max((crecimiento - t0) / (t1 - t0), 0), 1);
        return p * p * (3 - 2 * p);
    },

    aplicarCrecimiento(p) {
        const c = p.crecimiento;

        p.copias.forEach((copia, k) => {
            const desfase = k * 0.7;   // las macetas no ondean todas a la vez

            copia.tallosInfo.forEach(t => {
                const q = this.etapa(c, t.t0, t.t1);
                t.malla.scale.y = Math.max(q, 0.0001);
                t.malla.visible = q > 0.004;
                t.malla.userData.progreso = q;
            });

            copia.ramasInfo.forEach(r => {
                const q = this.etapa(c, r.t0, r.t1);
                r.palo.scale.y = Math.max(q, 0.0001);
                r.palo.visible = q > 0.01;
                r.palo.userData.progreso = q;
                if (r.anclaMedia) r.anclaMedia.position.y = r.largo * q * 0.55;
                if (r.anclaPunta) r.anclaPunta.position.y = r.largo * q;

                r.grupo.rotation.z = r.inclinacion +
                    Math.sin(this.tiempo * 1.2 + r.fase) * 0.03 * this.viento;
            });

            copia.hojasInfo.forEach(h => {
                const q = this.etapa(c, h.t0, h.t1);
                h.malla.visible = q > 0.01;
                h.malla.scale.copy(h.escalaFinal).multiplyScalar(q);
                h.malla.userData.progreso = q;
                const u = h.malla.material.uniforms;
                u.uTiempo.value   = this.tiempo + desfase;
                u.uViento.value   = this.viento;
                u.uProgreso.value = q;
                u.uEstres.value   = p.estres;
            });

            copia.organosInfo.forEach(o => {
                const q = this.etapa(c, o.t0, o.t1);
                o.grupo.visible = q > 0.01;
                o.grupo.scale.setScalar(Math.max(o.escala * q, 0.001));
                o.mallas.forEach(m => { m.userData.progreso = q; });
            });

            copia.planta.rotation.z = Math.sin(this.tiempo * 0.8 + desfase) * 0.025 * this.viento;
            copia.planta.rotation.x = Math.cos(this.tiempo * 0.6 + desfase) * 0.018 * this.viento;
        });
    },

    // ----------------------------------------------------------------------
    // 5. Encuadre de la cámara
    // ----------------------------------------------------------------------
    /**
     * Caja que ocupará la planta cuando esté crecida del todo.
     *
     * Se fuerza el crecimiento al 100 %, se recalculan las matrices y recién
     * entonces se mide: Box3.setFromObject lee las matrices de mundo, y
     * Three.js solo las actualiza antes de dibujar. Medir sin el
     * updateMatrixWorld devuelve la caja del frame anterior.
     * Al terminar se restaura el crecimiento real, así que no se ve nada raro.
     */
    medirCompleto(id) {
        const p = this.plantas[id];
        const guardado = p.crecimiento;

        p.crecimiento = 1;
        this.aplicarCrecimiento(p);
        p.raiz.updateMatrixWorld(true);
        const caja = new THREE.Box3().setFromObject(p.raiz);

        p.crecimiento = guardado;
        this.aplicarCrecimiento(p);

        return caja;
    },

    /**
     * Coloca la cámara a la distancia justa para que quepa todo lo que hay
     * en escena. Es lo que permite que un maíz de 4 unidades y una lechuga
     * de 1.3 se vean bien sin tocar nada a mano.
     */
    encuadrar() {
        const ids = Object.keys(this.plantas);
        if (!ids.length) return;

        const caja = new THREE.Box3();
        ids.forEach(id => caja.union(this.medirCompleto(id)));

        const centro = caja.getCenter(new THREE.Vector3());
        const tam    = caja.getSize(new THREE.Vector3());

        // El encuadre lo manda la dimensión más exigente: la altura contra el
        // campo de visión vertical, el ancho contra ese mismo campo corregido
        // por la relación de aspecto del lienzo.
        const fov = THREE.MathUtils.degToRad(this.camara.fov);
        const distAlto  = (tam.y / 2) / Math.tan(fov / 2);
        const distAncho = (tam.x / 2) / (Math.tan(fov / 2) * this.camara.aspect);

        const MARGEN = 1.45;   // aire alrededor para que no toque los bordes
        const dist = Math.min(20, Math.max(2.6, Math.max(distAlto, distAncho) * MARGEN));

        const direccion = new THREE.Vector3(0.34, 0.26, 1).normalize();
        this.controles.target.set(0, centro.y, 0);
        this.camara.position.copy(this.controles.target)
                            .add(direccion.multiplyScalar(dist));
        this.controles.update();
    },

    /** Se conserva el nombre porque app.js lo llama al cambiar de vista. */
    setModoAB(activo) {
        this.encuadrar();
    },

    reiniciarCamara() {
        this.encuadrar();
    },

    // ----------------------------------------------------------------------
    // 6. Raycasting
    // ----------------------------------------------------------------------
    resaltar(objeto, encendido) {
        if (!objeto) return;
        const u = objeto.material.uniforms;
        if (u && u.uSeleccion) {
            u.uSeleccion.value = encendido ? 1 : 0;
        } else if (objeto.material.emissive) {
            objeto.material.emissive.setHex(encendido ? 0x3a4d2a : 0x000000);
        }
    },

    conectarRaycasting(lienzo) {
        let xAbajo = 0, yAbajo = 0;

        lienzo.addEventListener('pointerdown', e => { xAbajo = e.clientX; yAbajo = e.clientY; });

        lienzo.addEventListener('pointerup', e => {
            if (Math.abs(e.clientX - xAbajo) + Math.abs(e.clientY - yAbajo) > 5) return;

            const caja = lienzo.getBoundingClientRect();
            this.puntero.x = ((e.clientX - caja.left) / caja.width) * 2 - 1;
            this.puntero.y = -((e.clientY - caja.top) / caja.height) * 2 + 1;

            this.rayo.setFromCamera(this.puntero, this.camara);
            const tocados = this.rayo.intersectObjects(this.seleccionables, false)
                                    .filter(t => t.object.visible);

            this.resaltar(this.seleccionado, false);
            this.seleccionado = tocados.length ? tocados[0].object : null;
            this.resaltar(this.seleccionado, true);

            if (this.onSeleccion) {
                this.onSeleccion(this.seleccionado ? this.seleccionado.userData : null,
                                 this.seleccionado);
            }
        });
    },

    alturaMundo(objeto) {
        const v = new THREE.Vector3();
        objeto.getWorldPosition(v);
        return v.y;
    },

    // ----------------------------------------------------------------------
    // 7. Bucle
    // ----------------------------------------------------------------------
    redimensionar() {
        const l = this.lienzo;
        if (!l) return;
        const w = l.clientWidth, h = l.clientHeight;
        if (!w || !h) return;

        this.camara.aspect = w / h;
        this.camara.updateProjectionMatrix();
        this.renderizador.setSize(w, h, false);
    },

    animar() {
        requestAnimationFrame(() => this.animar());

        this.tiempo += Math.min(this.reloj.getDelta(), 0.05);
        Object.values(this.plantas).forEach(p => this.aplicarCrecimiento(p));

        this.controles.update();
        this.renderizador.render(this.escena, this.camara);
    }
};
