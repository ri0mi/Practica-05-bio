-- ==========================================================================
--  PRÁCTICA 05 — Datos de arranque
--  Seis especies y dos simulaciones de ejemplo (una pareja A/B) con sus
--  mediciones y decisiones, para poder probar la app sin correr nada.
-- ==========================================================================

SET NAMES utf8mb4;

USE practica05_bioinformatica;

-- --------------------------------------------------------------------------
-- Catálogo de especies
-- --------------------------------------------------------------------------
INSERT INTO especies
(nombre_comun, nombre_cientifico, familia, modelo_default, r_default, k_default,
 biomasa_inicial, dias_madurez, luz_optima, agua_optima, temp_optima,
 nutrientes_optimo, co2_optimo, tol_luz, tol_agua, tol_temp, tol_nutrientes,
 tol_co2, forma, color_petalo, color_hoja, n_ramas, altura_max_u, notas)
VALUES
('Maíz', 'Zea mays', 'Poaceae', 'logistico', 0.1800, 350.00,
 0.800, 120, 90.0, 70.0, 24.0, 80.0, 400.0, 40.0, 30.0, 10.0, 35.0, 220.0,
 'maiz', '#f2c14e', '#6f9c3d', 4, 2.60,
 'Cultivo C4, muy eficiente con luz alta. Sensible a la sequía en floración.'),

('Frijol', 'Phaseolus vulgaris', 'Fabaceae', 'logistico', 0.1600, 180.00,
 0.600, 90, 80.0, 65.0, 21.0, 70.0, 400.0, 45.0, 30.0, 9.0, 45.0, 250.0,
 'frijol', '#c76b8a', '#7f9a3c', 3, 1.80,
 'Fija nitrógeno, tolera suelos pobres. Muy sensible al exceso de agua.'),

('Tomate', 'Solanum lycopersicum', 'Solanaceae', 'logistico', 0.1500, 420.00,
 0.700, 110, 85.0, 75.0, 23.0, 85.0, 450.0, 40.0, 25.0, 8.0, 30.0, 220.0,
 'tomate', '#f6c453', '#5f8a3a', 3, 2.40,
 'Alta demanda de nutrientes y agua constante. El estrés hídrico parte el fruto.'),

('Arabidopsis', 'Arabidopsis thaliana', 'Brassicaceae', 'gompertz', 0.2200, 25.00,
 0.050, 45, 70.0, 60.0, 22.0, 60.0, 400.0, 50.0, 40.0, 11.0, 50.0, 300.0,
 'arabidopsis', '#f5f1e6', '#8fae4d', 2, 1.10,
 'Organismo modelo en genética vegetal. Ciclo corto, poca biomasa.'),

('Lechuga', 'Lactuca sativa', 'Asteraceae', 'logistico', 0.2000, 120.00,
 0.400, 60, 65.0, 80.0, 18.0, 70.0, 400.0, 45.0, 25.0, 7.0, 40.0, 250.0,
 'roseta', '#e8e2d2', '#86a83f', 3, 1.30,
 'Prefiere clima fresco. Con calor se espiga y amarga.'),

('Trigo', 'Triticum aestivum', 'Poaceae', 'gompertz', 0.1400, 260.00,
 0.500, 130, 85.0, 60.0, 20.0, 75.0, 400.0, 45.0, 35.0, 12.0, 40.0, 260.0,
 'trigo', '#d9a018', '#93a86a', 4, 2.20,
 'Cultivo de invierno, tolera frío. El exceso de nitrógeno lo acama.');

-- --------------------------------------------------------------------------
-- Simulación A: tomate con riego moderado
-- --------------------------------------------------------------------------
INSERT INTO simulaciones
(especie_id, nombre, notas, modelo, r, k, dias, luz, agua, temperatura,
 nutrientes, co2, escenario, grupo_ab, biomasa_final, altura_final, hojas_final,
 dias_a_madurez, estres_promedio, icr_promedio, eficiencia)
VALUES
((SELECT id FROM especies WHERE nombre_cientifico = 'Solanum lycopersicum'),
 'Tomate · riego moderado', 'Escenario de control con agua al 60 %.',
 'logistico', 0.1500, 420.00, 110, 85.0, 60.0, 23.0, 85.0, 450.0,
 'A', 'riego-tomate-2026', 392.40, 2.28, 14, 96, 18.75, 0.06180, 4.0875);

SET @simA = LAST_INSERT_ID();

-- --------------------------------------------------------------------------
-- Simulación B: el mismo tomate con riego óptimo
-- --------------------------------------------------------------------------
INSERT INTO simulaciones
(especie_id, nombre, notas, modelo, r, k, dias, luz, agua, temperatura,
 nutrientes, co2, escenario, grupo_ab, biomasa_final, altura_final, hojas_final,
 dias_a_madurez, estres_promedio, icr_promedio, eficiencia)
VALUES
((SELECT id FROM especies WHERE nombre_cientifico = 'Solanum lycopersicum'),
 'Tomate · riego óptimo', 'Mismo cultivo subiendo el agua al 75 %.',
 'logistico', 0.1500, 420.00, 110, 85.0, 75.0, 23.0, 85.0, 450.0,
 'B', 'riego-tomate-2026', 415.10, 2.38, 16, 84, 4.20, 0.07020, 4.9417);

SET @simB = LAST_INSERT_ID();

-- --------------------------------------------------------------------------
-- Mediciones: curva logística muestreada cada 10 días para las dos corridas.
-- Son los valores que resuelve el motor; aquí van precalculados para tener
-- datos de ejemplo sin ejecutar la simulación.
-- --------------------------------------------------------------------------
INSERT INTO mediciones
(simulacion_id, dia, biomasa, altura, n_hojas, n_ramas,
 estres_hidrico, estres_termico, estres_luminico, estres_nutricional,
 estres_total, icr) VALUES
(@simA,   0,   0.700, 0.004,  0, 0, 60.00, 0.00, 0.00, 0.00, 18.00, 0.00000),
(@simA,  10,   2.740, 0.016,  1, 0, 60.00, 0.00, 0.00, 0.00, 18.00, 0.13650),
(@simA,  20,  10.480, 0.061,  2, 1, 60.00, 0.00, 0.00, 0.00, 18.00, 0.13410),
(@simA,  30,  38.220, 0.222,  4, 2, 60.00, 0.00, 0.00, 0.00, 18.00, 0.12940),
(@simA,  40, 114.860, 0.667,  7, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.11010),
(@simA,  50, 243.300, 1.412, 10, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.07510),
(@simA,  60, 339.520, 1.971, 12, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.03340),
(@simA,  70, 383.100, 2.224, 13, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.01210),
(@simA,  80, 396.610, 2.302, 14, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.00350),
(@simA,  90, 399.980, 2.322, 14, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.00080),
(@simA, 100, 392.400, 2.280, 14, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.00020),
(@simA, 110, 392.400, 2.280, 14, 3, 60.00, 0.00, 0.00, 0.00, 18.00, 0.00000);

INSERT INTO mediciones
(simulacion_id, dia, biomasa, altura, n_hojas, n_ramas,
 estres_hidrico, estres_termico, estres_luminico, estres_nutricional,
 estres_total, icr) VALUES
(@simB,   0,   0.700, 0.004,  0, 0,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00000),
(@simB,  10,   3.120, 0.018,  1, 0,  0.00, 0.00, 0.00, 0.00,  0.00, 0.14940),
(@simB,  20,  13.610, 0.078,  3, 1,  0.00, 0.00, 0.00, 0.00,  0.00, 0.14720),
(@simB,  30,  55.430, 0.318,  5, 2,  0.00, 0.00, 0.00, 0.00,  0.00, 0.14040),
(@simB,  40, 164.820, 0.945,  8, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.10900),
(@simB,  50, 311.650, 1.787, 12, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.06370),
(@simB,  60, 385.740, 2.212, 14, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.02130),
(@simB,  70, 408.090, 2.340, 15, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00560),
(@simB,  80, 413.600, 2.372, 16, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00130),
(@simB,  90, 414.900, 2.380, 16, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00030),
(@simB, 100, 415.100, 2.380, 16, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00010),
(@simB, 110, 415.100, 2.380, 16, 3,  0.00, 0.00, 0.00, 0.00,  0.00, 0.00000);

-- --------------------------------------------------------------------------
-- Decisiones emitidas por el motor durante cada corrida
-- --------------------------------------------------------------------------
INSERT INTO decisiones (simulacion_id, dia, tipo, severidad, mensaje, valor_sugerido) VALUES
(@simA,   0, 'riego',   'critico', 'Humedad 15 puntos por debajo del óptimo de la especie. Aumentar riego.', 'agua: 75 %'),
(@simA,  40, 'riego',   'aviso',   'Estrés hídrico sostenido durante la fase de máximo crecimiento.',       'agua: 75 %'),
(@simA,  96, 'cosecha', 'info',    'La planta alcanzó el 95 % de su capacidad de carga.',                   'cosechar día 96'),
(@simB,   0, 'general', 'info',    'Condiciones dentro del rango óptimo para la especie.',                  NULL),
(@simB,  84, 'cosecha', 'info',    'La planta alcanzó el 95 % de su capacidad de carga.',                   'cosechar día 84'),
(@simB,  84, 'especie', 'info',    'Escenario B supera a A en 22.7 g de biomasa y madura 12 días antes.',   'adoptar escenario B');
