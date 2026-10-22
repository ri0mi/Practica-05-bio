<?php
/**
 * Consultas de analítica. Aquí es donde la base de datos hace el trabajo:
 * agregados, rankings y promedios que el frontend solo dibuja.
 */
class ReportesController
{
    /** GET /api/reportes/top-biomasa?limite=5 */
    public static function topBiomasa(int $limite = 5): array
    {
        $limite = max(1, min(50, $limite));

        $sql = "SELECT s.id, s.nombre, s.modelo, s.escenario,
                       s.biomasa_final, s.dias_a_madurez, s.estres_promedio,
                       s.eficiencia, e.nombre_comun, e.nombre_cientifico
                FROM simulaciones s
                JOIN especies e ON e.id = s.especie_id
                ORDER BY s.biomasa_final DESC
                LIMIT $limite";

        return numerizarTodas(db()->query($sql)->fetchAll(),
            ['id','biomasa_final','dias_a_madurez','estres_promedio','eficiencia']);
    }

    /**
     * GET /api/reportes/eficiencia
     * Biomasa producida por día de cultivo, promediada por especie.
     * Solo entran especies con al menos una corrida guardada.
     */
    public static function eficienciaEspecies(): array
    {
        $sql = 'SELECT * FROM v_eficiencia_especie
                WHERE n_simulaciones > 0
                ORDER BY eficiencia_media DESC';

        return numerizarTodas(db()->query($sql)->fetchAll(),
            ['especie_id','n_simulaciones','biomasa_media','estres_medio',
             'dias_madurez_medio','eficiencia_media']);
    }

    /** GET /api/reportes/resumen — KPIs globales para el encabezado */
    public static function resumen(): array
    {
        $sql = 'SELECT
                    COUNT(*)                            AS n_simulaciones,
                    COUNT(DISTINCT especie_id)          AS n_especies_probadas,
                    ROUND(AVG(biomasa_final), 2)        AS biomasa_media,
                    ROUND(AVG(estres_promedio), 2)      AS estres_medio,
                    ROUND(AVG(dias_a_madurez), 1)       AS dias_madurez_medio,
                    ROUND(MAX(biomasa_final), 2)        AS biomasa_maxima
                FROM simulaciones';

        $fila = db()->query($sql)->fetch() ?: [];

        $mejor = db()->query(
            'SELECT e.nombre_comun, ROUND(AVG(s.eficiencia), 4) AS eficiencia
             FROM simulaciones s
             JOIN especies e ON e.id = s.especie_id
             GROUP BY e.id, e.nombre_comun
             ORDER BY eficiencia DESC
             LIMIT 1'
        )->fetch();

        $fila['especie_mas_eficiente'] = $mejor['nombre_comun'] ?? null;
        $fila['eficiencia_top']        = $mejor ? 0 + $mejor['eficiencia'] : null;

        return numerizar($fila, ['n_simulaciones','n_especies_probadas','biomasa_media',
            'estres_medio','dias_madurez_medio','biomasa_maxima']);
    }

    /** GET /api/reportes/alertas — decisiones críticas más recientes */
    public static function alertas(int $limite = 20): array
    {
        $limite = max(1, min(100, $limite));

        $sql = "SELECT d.*, s.nombre AS simulacion, e.nombre_comun
                FROM decisiones d
                JOIN simulaciones s ON s.id = d.simulacion_id
                JOIN especies e     ON e.id = s.especie_id
                WHERE d.severidad IN ('aviso','critico')
                ORDER BY d.creada_en DESC, d.id DESC
                LIMIT $limite";

        return db()->query($sql)->fetchAll();
    }

    /**
     * GET /api/reportes/csv?simulacion=ID
     * Devuelve el CSV como cadena; index.php le pone las cabeceras de descarga.
     */
    public static function csv(int $simulacionId): string
    {
        $sim = SimulacionesController::obtener($simulacionId);

        $salida = fopen('php://temp', 'r+');

        fputcsv($salida, ['Simulacion', $sim['nombre']]);
        fputcsv($salida, ['Especie', $sim['nombre_comun'] . ' (' . $sim['nombre_cientifico'] . ')']);
        fputcsv($salida, ['Modelo', $sim['modelo']]);
        fputcsv($salida, ['r', $sim['r'], 'K', $sim['k'], 'Dias', $sim['dias']]);
        fputcsv($salida, ['Luz', $sim['luz'], 'Agua', $sim['agua'],
                          'Temperatura', $sim['temperatura'],
                          'Nutrientes', $sim['nutrientes'], 'CO2', $sim['co2']]);
        fputcsv($salida, ['Biomasa final (g)', $sim['biomasa_final'],
                          'Dias a madurez', $sim['dias_a_madurez'],
                          'Estres promedio', $sim['estres_promedio']]);
        fputcsv($salida, []);

        fputcsv($salida, ['dia','biomasa_g','altura_u','n_hojas','n_ramas',
                          'estres_hidrico','estres_termico','estres_luminico',
                          'estres_nutricional','estres_total','icr']);

        foreach ($sim['mediciones'] as $m) {
            fputcsv($salida, [
                $m['dia'], $m['biomasa'], $m['altura'], $m['n_hojas'], $m['n_ramas'],
                $m['estres_hidrico'], $m['estres_termico'], $m['estres_luminico'],
                $m['estres_nutricional'], $m['estres_total'], $m['icr'],
            ]);
        }

        if ($sim['decisiones']) {
            fputcsv($salida, []);
            fputcsv($salida, ['dia','tipo','severidad','mensaje','valor_sugerido']);
            foreach ($sim['decisiones'] as $d) {
                fputcsv($salida, [$d['dia'], $d['tipo'], $d['severidad'],
                                  $d['mensaje'], $d['valor_sugerido']]);
            }
        }

        rewind($salida);
        $texto = stream_get_contents($salida);
        fclose($salida);

        return $texto;
    }
}
