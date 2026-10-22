<?php
/**
 * Catálogo de especies.
 *
 * Los controladores no saben nada de Flight: reciben parámetros y devuelven
 * arreglos. index.php es el único archivo que conoce el framework. Así la
 * lógica se puede probar sin levantar un servidor HTTP.
 */
class EspeciesController
{
    /** GET /api/especies */
    public static function listar(): array
    {
        $sql = 'SELECT * FROM especies ORDER BY nombre_comun';
        $filas = db()->query($sql)->fetchAll();

        return numerizarTodas($filas, NUM_ESPECIE);
    }

    /** GET /api/especies/{id} */
    public static function obtener(int $id): array
    {
        $st = db()->prepare('SELECT * FROM especies WHERE id = ?');
        $st->execute([$id]);
        $fila = $st->fetch();

        if (!$fila) {
            throw new ApiError("No existe la especie $id", 404);
        }

        return numerizar($fila, NUM_ESPECIE);
    }

    /** POST /api/especies */
    public static function crear(array $d): array
    {
        foreach (['nombre_comun', 'nombre_cientifico', 'familia'] as $campo) {
            if (empty($d[$campo])) {
                throw new ApiError("Falta el campo $campo", 422);
            }
        }

        $sql = 'INSERT INTO especies
                (nombre_comun, nombre_cientifico, familia, modelo_default,
                 r_default, k_default, biomasa_inicial, dias_madurez,
                 luz_optima, agua_optima, temp_optima, nutrientes_optimo, co2_optimo,
                 tol_luz, tol_agua, tol_temp, tol_nutrientes, tol_co2,
                 color_petalo, color_hoja, n_ramas, altura_max_u, notas)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

        db()->prepare($sql)->execute([
            $d['nombre_comun'],
            $d['nombre_cientifico'],
            $d['familia'],
            $d['modelo_default']    ?? 'logistico',
            $d['r_default']         ?? 0.15,
            $d['k_default']         ?? 200,
            $d['biomasa_inicial']   ?? 0.5,
            $d['dias_madurez']      ?? 90,
            $d['luz_optima']        ?? 80,
            $d['agua_optima']       ?? 70,
            $d['temp_optima']       ?? 22,
            $d['nutrientes_optimo'] ?? 75,
            $d['co2_optimo']        ?? 400,
            $d['tol_luz']           ?? 45,
            $d['tol_agua']          ?? 35,
            $d['tol_temp']          ?? 12,
            $d['tol_nutrientes']    ?? 40,
            $d['tol_co2']           ?? 250,
            $d['color_petalo']      ?? '#ff8c2b',
            $d['color_hoja']        ?? '#7f9a3c',
            $d['n_ramas']           ?? 3,
            $d['altura_max_u']      ?? 2.0,
            $d['notas']             ?? null,
        ]);

        return self::obtener((int) db()->lastInsertId());
    }
}
