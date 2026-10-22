// ==========================================================================
//  GRÁFICAS (Chart.js)
//  Dos formas, cada una con un trabajo distinto:
//    · curva de biomasa  -> cambio en el tiempo, comparación A/B
//    · barras de estrés  -> magnitud por variable, de un vistazo
//  Los colores salen de una paleta validada para daltonismo y contraste sobre
//  el fondo oscuro de los paneles.
// ==========================================================================

const Graficas = {

    // Paleta categórica (pasa separación CVD y contraste ≥3:1 sobre #161b22)
    COLORES: {
        A: '#3987e5',   // azul
        B: '#d95926',   // naranja
        hidrico: '#3987e5',
        termico: '#d95926',
        luminico: '#199e70',
        nutricional: '#9085e9'
    },

    TINTA:  '#c9d1d9',
    TENUE:  '#8b98a5',
    REJILLA:'#263241',

    biomasa: null,
    estres: null,

    /**
     * Plugin propio: escribe el nombre de la serie al final de su línea.
     * La identidad no debe depender solo del color, y una etiqueta directa en
     * el último punto se lee mejor que ir a buscar la leyenda.
     */
    etiquetasDirectas: {
        id: 'etiquetasDirectas',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = '600 11px system-ui, sans-serif';
            ctx.textBaseline = 'middle';

            chart.data.datasets.forEach((ds, i) => {
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden || !meta.data.length) return;

                const punto = meta.data[meta.data.length - 1];
                ctx.fillStyle = ds.borderColor;
                ctx.fillText(' ' + ds.label, punto.x + 4, punto.y);
            });

            ctx.restore();
        }
    },

    comunes(titulo) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: {
                    display: true, text: titulo,
                    color: this.TINTA, align: 'start',
                    font: { size: 12, weight: '600' },
                    padding: { bottom: 10 }
                },
                legend: {
                    display: true, position: 'bottom',
                    labels: {
                        color: this.TENUE, boxWidth: 10, boxHeight: 10,
                        usePointStyle: true, pointStyle: 'rectRounded',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: '#0d1117',
                    borderColor: '#30363d', borderWidth: 1,
                    titleColor: this.TINTA, bodyColor: this.TINTA,
                    padding: 10, displayColors: true
                }
            }
        };
    },

    ejes(tituloY) {
        return {
            x: {
                title: { display: true, text: 'día', color: this.TENUE, font: { size: 11 } },
                ticks: { color: this.TENUE, maxTicksLimit: 10, font: { size: 10 } },
                grid: { color: this.REJILLA, drawTicks: false }
            },
            y: {
                title: { display: true, text: tituloY, color: this.TENUE, font: { size: 11 } },
                ticks: { color: this.TENUE, font: { size: 10 } },
                grid: { color: this.REJILLA, drawTicks: false },
                beginAtZero: true
            }
        };
    },

    // ----------------------------------------------------------------------
    // Curva de biomasa
    // ----------------------------------------------------------------------
    iniciarBiomasa(canvas) {
        this.biomasa = new Chart(canvas, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                ...this.comunes('Biomasa acumulada (g)'),
                scales: this.ejes('gramos'),
                layout: { padding: { right: 56 } }   // espacio para la etiqueta directa
            },
            plugins: [this.etiquetasDirectas]
        });
    },

    serie(nombre, color, mediciones, campo = 'biomasa') {
        return {
            label: nombre,
            data: mediciones.map(m => m[campo]),
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.25,
            fill: false
        };
    },

    /** series: [{ nombre, color, mediciones }] */
    dibujarBiomasa(series) {
        if (!this.biomasa) return;

        const masLarga = series.reduce(
            (a, s) => s.mediciones.length > a.length ? s.mediciones : a, []);

        this.biomasa.data.labels = masLarga.map(m => m.dia);
        this.biomasa.data.datasets = series.map(s => this.serie(s.nombre, s.color, s.mediciones));
        // Con una sola serie el título ya la nombra: la leyenda sobra
        this.biomasa.options.plugins.legend.display = series.length > 1;
        this.biomasa.update('none');
    },

    // ----------------------------------------------------------------------
    // Barras de estrés
    // ----------------------------------------------------------------------
    iniciarEstres(canvas) {
        this.estres = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Hídrico', 'Térmico', 'Lumínico', 'Nutricional'],
                datasets: [{
                    label: 'Índice de estrés',
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        this.COLORES.hidrico, this.COLORES.termico,
                        this.COLORES.luminico, this.COLORES.nutricional
                    ],
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 18
                }]
            },
            options: {
                ...this.comunes('Índices de estrés (0–100)'),
                indexAxis: 'y',
                plugins: {
                    ...this.comunes('Índices de estrés (0–100)').plugins,
                    legend: { display: false }
                },
                scales: {
                    x: {
                        min: 0, max: 100,
                        ticks: { color: this.TENUE, stepSize: 25, font: { size: 10 } },
                        grid: { color: this.REJILLA, drawTicks: false }
                    },
                    y: {
                        ticks: { color: this.TINTA, font: { size: 11 } },
                        grid: { display: false }
                    }
                },
                layout: { padding: { right: 34 } }
            },
            plugins: [{
                // Valor al final de cada barra: el número exacto importa aquí,
                // y son solo cuatro, así que no satura.
                id: 'valorEnBarra',
                afterDatasetsDraw(chart) {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.font = '600 11px system-ui, sans-serif';
                    ctx.fillStyle = '#c9d1d9';
                    ctx.textBaseline = 'middle';

                    chart.getDatasetMeta(0).data.forEach((barra, i) => {
                        const v = chart.data.datasets[0].data[i];
                        ctx.fillText(Math.round(v), barra.x + 6, barra.y);
                    });

                    ctx.restore();
                }
            }]
        });
    },

    dibujarEstres(estres) {
        if (!this.estres) return;
        this.estres.data.datasets[0].data = [
            estres.hidrico, estres.termico, estres.luminico, estres.nutricional
        ];
        this.estres.update('none');
    },

    /**
     * Vista de tabla de las mediciones. Toda gráfica debe tener una
     * alternativa textual: aquí sirve además como historial de la corrida.
     */
    tablaMediciones(mediciones, paso = 10) {
        const filas = mediciones.filter(m => m.dia % paso === 0 || m.dia === mediciones.length - 1);

        return `
            <table class="tabla">
                <thead><tr>
                    <th>Día</th><th>Biomasa (g)</th><th>Altura (u)</th>
                    <th>Hojas</th><th>Ramas</th><th>Estrés</th><th>ICR</th>
                </tr></thead>
                <tbody>
                    ${filas.map(m => `<tr>
                        <td>${m.dia}</td>
                        <td>${(+m.biomasa).toFixed(2)}</td>
                        <td>${(+m.altura).toFixed(2)}</td>
                        <td>${m.n_hojas}</td>
                        <td>${m.n_ramas}</td>
                        <td>${(+m.estres_total).toFixed(1)}</td>
                        <td>${(+m.icr).toFixed(4)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    }
};
