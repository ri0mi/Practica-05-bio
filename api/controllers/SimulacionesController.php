<?php
/**
 * Persistencia de corridas de simulación.
 *
 * El frontend ejecuta la simulación completa en JavaScript y manda el
 * resultado entero: la configuración, la serie de mediciones día por día y
 * las decisiones que emitió el motor. Todo eso se guarda en una transacción,
 * porque una simulación sin sus mediciones no sirve de nada.
 */
class SimulacionesController
{
    /** GET /api/simulaciones  (admite ?especie=ID&grupo=ETIQUETA&limite=N) */
    public static function listar(array $q = []): array
    {
        $sql = 'SELECT s.*, e.nombre_comun, e.nombre_cientifico
                FROM simulaciones s
                JOIN especies e ON e.id = s.especie_id
                WHERE 1 = 1';
        $args = [];

        if (!empty($q['especie'])) {
            $sql .= ' AND s.especie_id = ?';
            $args[] = (int) $q['especie'];
        }
        if (!empty($q['grupo'])) {
            $sql .= ' AND s.grupo_ab = ?';
            $args[] = $q['grupo'];
        }

        $sql .= ' ORDER BY s.creada_en DESC';
        $sql .= ' LIMIT ' . max(1, min(200, (int) ($q['limite'] ?? 50)));

        $st = db()->prepare($sql);
        $st->execute($args);

        return numerizarTodas($st->fetchAll(), NUM_SIMULACION);
    }

    /** GET /api/simulaciones/{id} — incluye mediciones y decisiones */
    public static function obtener(int $id): array
    {
        $st = db()->prepare('SELECT s.*, e.nombre_comun, e.nombre_cientifico,
                                    e.color_petalo, e.color_hoja
                             FROM simulaciones s
                             JOIN especies e ON e.id = s.especie_id
                             WHERE s.id = ?');
        $st->execute([$id]);
        $sim = $st->fetch();

        if (!$sim) {
            throw new ApiError("No existe la simulación $id", 404);
        }

        $sim = numerizar($sim, NUM_SIMULACION);
        $sim['mediciones'] = self::mediciones($id);
        $sim['decisiones'] = self::decisiones($id);

        return $sim;
    }

    /** GET /api/simulaciones/{id}/mediciones */
    public static function mediciones(int $id): array
    {
        $st = db()->prepare('SELECT * FROM mediciones WHERE simulacion_id = ? ORDER BY dia');
        $st->execute([$id]);

        return numerizarTodas($st->fetchAll(), NUM_MEDICION);
    }

    /** GET /api/simulaciones/{id}/decisiones */
    public static function decisiones(int $id): array
    {
        $st = db()->prepare('SELECT * FROM decisiones WHERE simulacion_id = ? ORDER BY dia, id');
        $st->execute([$id]);

        return $st->fetchAll();
    }

    /**
     * POST /api/simulaciones
     * Espera: { simulacion: {...}, mediciones: [...], decisiones: [...] }
     */
    public static function crear(array $d): array
    {
        $s = $d['simulacion'] ?? null;

        if (!$s || empty($s['especie_id']) || empty($s['nombre'])) {
            throw new ApiError('Faltan especie_id o nombre en el bloque simulacion', 422);
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $sql = 'INSERT INTO simulaciones
                    (especie_id, nombre, notas, modelo, r, k, dias,
                     luz, agua, temperatura, nutrientes, co2,
                     escenario, grupo_ab,
                     biomasa_final, altura_final, hojas_final, dias_a_madurez,
                     estres_promedio, icr_promedio, eficiencia)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

            $pdo->prepare($sql)->execute([
                (int) $s['especie_id'],
                $s['nombre'],
                $s['notas']           ?? null,
                $s['modelo']          ?? 'logistico',
                $s['r']               ?? 0.15,
                $s['k']               ?? 200,
                $s['dias']            ?? 90,
                $s['luz']             ?? 80,
                $s['agua']            ?? 70,
                $s['temperatura']     ?? 22,
                $s['nutrientes']      ?? 75,
                $s['co2']             ?? 400,
                $s['escenario']       ?? 'UNICO',
                $s['grupo_ab']        ?? null,
                $s['biomasa_final']   ?? 0,
                $s['altura_final']    ?? 0,
                $s['hojas_final']     ?? 0,
                $s['dias_a_madurez']  ?? null,
                $s['estres_promedio'] ?? 0,
                $s['icr_promedio']    ?? 0,
                $s['eficiencia']      ?? 0,
            ]);

            $simId = (int) $pdo->lastInsertId();

            // Las mediciones se insertan con una sola sentencia preparada que
            // se reutiliza: son decenas de filas por corrida.
            if (!empty($d['mediciones'])) {
                $stMed = $pdo->prepare(
                    'INSERT INTO mediciones
                     (simulacion_id, dia, biomasa, altura, n_hojas, n_ramas,
                      estres_hidrico, estres_termico, estres_luminico,
                      estres_nutricional, estres_total, icr)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
                );

                foreach ($d['mediciones'] as $m) {
                    $stMed->execute([
                        $simId,
                        (int) $m['dia'],
                        $m['biomasa']            ?? 0,
                        $m['altura']             ?? 0,
                        $m['n_hojas']            ?? 0,
                        $m['n_ramas']            ?? 0,
                        $m['estres_hidrico']     ?? 0,
                        $m['estres_termico']     ?? 0,
                        $m['estres_luminico']    ?? 0,
                        $m['estres_nutricional'] ?? 0,
                        $m['estres_total']       ?? 0,
                        $m['icr']                ?? 0,
                    ]);
                }
            }

            if (!empty($d['decisiones'])) {
                $stDec = $pdo->prepare(
                    'INSERT INTO decisiones
                     (simulacion_id, dia, tipo, severidad, mensaje, valor_sugerido)
                     VALUES (?,?,?,?,?,?)'
                );

                foreach ($d['decisiones'] as $x) {
                    $stDec->execute([
                        $simId,
                        (int) ($x['dia'] ?? 0),
                        $x['tipo']           ?? 'general',
                        $x['severidad']      ?? 'info',
                        mb_substr($x['mensaje'] ?? '', 0, 255),
                        $x['valor_sugerido'] ?? null,
                    ]);
                }
            }

            $pdo->commit();

        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return self::obtener($simId);
    }

    /** DELETE /api/simulaciones/{id} */
    public static function borrar(int $id): array
    {
        $st = db()->prepare('DELETE FROM simulaciones WHERE id = ?');
        $st->execute([$id]);

        if ($st->rowCount() === 0) {
            throw new ApiError("No existe la simulación $id", 404);
        }

        // Las mediciones y decisiones caen solas por ON DELETE CASCADE
        return ['borrada' => $id];
    }

    /**
     * GET /api/comparar?a=ID&b=ID
     * Devuelve las dos corridas y un veredicto listo para mostrar.
     */
    public static function comparar(int $idA, int $idB): array
    {
        $a = self::obtener($idA);
        $b = self::obtener($idB);

        $difBiomasa = round($b['biomasa_final'] - $a['biomasa_final'], 2);
        $difEstres  = round($b['estres_promedio'] - $a['estres_promedio'], 2);

        $diasA = $a['dias_a_madurez'];
        $diasB = $b['dias_a_madurez'];
        $difDias = ($diasA !== null && $diasB !== null) ? $diasB - $diasA : null;

        // Gana quien más biomasa produzca; si quedan casi empatados en biomasa,
        // desempata el que madure antes.
        $ganador = 'empate';
        if (abs($difBiomasa) > 0.01 * max($a['biomasa_final'], $b['biomasa_final'])) {
            $ganador = $difBiomasa > 0 ? 'B' : 'A';
        } elseif ($difDias !== null && $difDias !== 0) {
            $ganador = $difDias < 0 ? 'B' : 'A';
        }

        $texto = match ($ganador) {
            'B' => sprintf('El escenario B rinde %.2f g más de biomasa%s.',
                           abs($difBiomasa),
                           $difDias !== null && $difDias < 0
                               ? sprintf(' y madura %d días antes', abs($difDias)) : ''),
            'A' => sprintf('El escenario A rinde %.2f g más de biomasa%s.',
                           abs($difBiomasa),
                           $difDias !== null && $difDias > 0
                               ? sprintf(' y madura %d días antes', abs($difDias)) : ''),
            default => 'Los dos escenarios rinden prácticamente lo mismo.',
        };

        return [
            'a' => $a,
            'b' => $b,
            'veredicto' => [
                'ganador'         => $ganador,
                'dif_biomasa'     => $difBiomasa,
                'dif_estres'      => $difEstres,
                'dif_dias'        => $difDias,
                'recomendacion'   => $texto,
            ],
        ];
    }
}
