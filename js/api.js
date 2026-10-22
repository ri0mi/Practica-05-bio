// ==========================================================================
//  CLIENTE DE LA API REST
//  Todo el acceso a la capa de datos pasa por aquí. Una sola función hace el
//  fetch y normaliza errores; el resto son atajos con nombre.
// ==========================================================================

const API = {

    // Ruta base. Con XAMPP el proyecto vive en htdocs/practica05, así que la
    // API queda en /practica05/api. Si lo montas en otro lado, cambia esto.
    base: 'api',

    /**
     * Envoltorio único de fetch.
     * La API responde siempre { ok, datos } o { ok:false, error }, así que
     * aquí se desenvuelve y se lanza una excepción con el mensaje del servidor
     * cuando algo falla. El llamador solo recibe los datos o una excepción.
     */
    // Se pone en true cuando ya se sabe cuál de las dos bases responde.
    baseResuelta: false,

    /**
     * Intenta primero la ruta limpia (api/especies). Si Apache no tiene
     * mod_rewrite activo ese camino no existe y devuelve un 404 suyo, así que
     * se reintenta una sola vez por api/index.php/especies, que funciona sin
     * reescritura. La base que responda se recuerda para el resto de la sesión.
     */
    async pedir(ruta, opciones = {}) {
        try {
            return await this.intentar(this.base, ruta, opciones);
        } catch (e) {
            if (this.baseResuelta || this.base !== 'api') throw e;

            const datos = await this.intentar('api/index.php', ruta, opciones);
            this.base = 'api/index.php';
            this.baseResuelta = true;
            return datos;
        }
    },

    /** Un solo intento contra una base concreta. */
    async intentar(base, ruta, opciones = {}) {
        let respuesta;

        try {
            respuesta = await fetch(`${base}${ruta}`, {
                headers: { 'Content-Type': 'application/json' },
                ...opciones
            });
        } catch (e) {
            throw new Error('No se pudo contactar la API. ¿Está corriendo Apache?');
        }

        const texto = await respuesta.text();
        let cuerpo;

        try {
            cuerpo = JSON.parse(texto);
        } catch (e) {
            // Si PHP imprime un warning antes del JSON, la respuesta no parsea.
            // Mostrar el crudo ayuda muchísimo a depurar.
            throw new Error(`Respuesta no JSON (${respuesta.status}): ${texto.slice(0, 160)}`);
        }

        if (!respuesta.ok || cuerpo.ok === false) {
            throw new Error(cuerpo.error || `Error HTTP ${respuesta.status}`);
        }

        return cuerpo.datos;
    },

    // ---- Especies ----
    especies()        { return this.pedir('/especies'); },
    especie(id)       { return this.pedir(`/especies/${id}`); },

    // ---- Simulaciones ----
    simulaciones(q = {}) {
        const qs = new URLSearchParams(q).toString();
        return this.pedir('/simulaciones' + (qs ? `?${qs}` : ''));
    },
    simulacion(id)    { return this.pedir(`/simulaciones/${id}`); },

    guardar(payload) {
        return this.pedir('/simulaciones', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    borrar(id) {
        return this.pedir(`/simulaciones/${id}`, { method: 'DELETE' });
    },

    comparar(a, b)    { return this.pedir(`/comparar?a=${a}&b=${b}`); },

    // ---- Reportes ----
    resumen()         { return this.pedir('/reportes/resumen'); },
    topBiomasa(n = 5) { return this.pedir(`/reportes/top-biomasa?limite=${n}`); },
    eficiencia()      { return this.pedir('/reportes/eficiencia'); },
    alertas(n = 20)   { return this.pedir(`/reportes/alertas?limite=${n}`); },

    /** El CSV no pasa por fetch: se abre como descarga directa. */
    urlCsv(simulacionId) {
        return `${this.base}/reportes/csv?simulacion=${simulacionId}`;
    }
};
