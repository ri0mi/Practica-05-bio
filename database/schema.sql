-- ==========================================================================
--  PRÁCTICA 05 — LABORATORIO BIOINFORMÁTICO DE CULTIVO
--  Esquema de la base de datos
--  Ricardo Melgoza y Rebeca Arciga
-- ==========================================================================

SET NAMES utf8mb4;

DROP DATABASE IF EXISTS practica05_bioinformatica;
CREATE DATABASE practica05_bioinformatica
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE practica05_bioinformatica;

-- --------------------------------------------------------------------------
-- especies
-- Catálogo de cultivos. Guarda los parámetros biológicos del modelo de
-- crecimiento, las condiciones óptimas de cada variable ambiental y la
-- tolerancia (cuánta desviación respecto al óptimo satura el estrés en 100).
-- --------------------------------------------------------------------------
CREATE TABLE especies (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nombre_comun        VARCHAR(80)  NOT NULL,
    nombre_cientifico   VARCHAR(120) NOT NULL,
    familia             VARCHAR(80)  NOT NULL,

    -- Parámetros del modelo de crecimiento
    modelo_default      ENUM('lineal','exponencial','logistico','gompertz')
                        NOT NULL DEFAULT 'logistico',
    r_default           DECIMAL(6,4) NOT NULL COMMENT 'Tasa intrínseca de crecimiento (1/día)',
    k_default           DECIMAL(8,2) NOT NULL COMMENT 'Capacidad de carga: biomasa máxima en gramos',
    biomasa_inicial     DECIMAL(8,3) NOT NULL DEFAULT 0.500 COMMENT 'N0 en gramos',
    dias_madurez        SMALLINT     NOT NULL COMMENT 'Días de referencia hasta madurez comercial',

    -- Condiciones óptimas
    luz_optima          DECIMAL(5,1) NOT NULL COMMENT '% de luz',
    agua_optima         DECIMAL(5,1) NOT NULL COMMENT '% de humedad en sustrato',
    temp_optima         DECIMAL(5,1) NOT NULL COMMENT 'grados Celsius',
    nutrientes_optimo   DECIMAL(5,1) NOT NULL COMMENT '% de disponibilidad',
    co2_optimo          DECIMAL(6,1) NOT NULL COMMENT 'ppm',

    -- Tolerancias: desviación absoluta que lleva el estrés de esa variable a 100
    tol_luz             DECIMAL(5,1) NOT NULL DEFAULT 45.0,
    tol_agua            DECIMAL(5,1) NOT NULL DEFAULT 35.0,
    tol_temp            DECIMAL(5,1) NOT NULL DEFAULT 12.0,
    tol_nutrientes      DECIMAL(5,1) NOT NULL DEFAULT 40.0,
    tol_co2             DECIMAL(6,1) NOT NULL DEFAULT 250.0,

    -- Parámetros de representación en la escena 3D
    forma               ENUM('maiz','trigo','tomate','frijol','roseta','arabidopsis')
                        NOT NULL DEFAULT 'tomate'
                        COMMENT 'Silueta con la que la escena 3D dibuja la especie',
    color_petalo        CHAR(7)      NOT NULL DEFAULT '#ff8c2b',
    color_hoja          CHAR(7)      NOT NULL DEFAULT '#7f9a3c',
    n_ramas             TINYINT      NOT NULL DEFAULT 3,
    altura_max_u        DECIMAL(5,2) NOT NULL DEFAULT 2.00 COMMENT 'Altura final en unidades de la escena',

    notas               TEXT,
    creada_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_especie_cientifico (nombre_cientifico)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- simulaciones
-- Una corrida completa. Guarda la configuración con la que se ejecutó y los
-- resultados agregados, para poder compararla sin recorrer las mediciones.
-- escenario y grupo_ab permiten emparejar dos corridas como prueba A/B.
-- --------------------------------------------------------------------------
CREATE TABLE simulaciones (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    especie_id          INT          NOT NULL,
    nombre              VARCHAR(120) NOT NULL,
    notas               TEXT,

    -- Configuración del modelo
    modelo              ENUM('lineal','exponencial','logistico','gompertz') NOT NULL,
    r                   DECIMAL(6,4) NOT NULL,
    k                   DECIMAL(8,2) NOT NULL,
    dias                SMALLINT     NOT NULL,

    -- Condiciones ambientales de la corrida
    luz                 DECIMAL(5,1) NOT NULL,
    agua                DECIMAL(5,1) NOT NULL,
    temperatura         DECIMAL(5,1) NOT NULL,
    nutrientes          DECIMAL(5,1) NOT NULL,
    co2                 DECIMAL(6,1) NOT NULL,

    -- Escenario A/B
    escenario           ENUM('UNICO','A','B') NOT NULL DEFAULT 'UNICO',
    grupo_ab            VARCHAR(40)  NULL COMMENT 'Etiqueta que empareja la corrida A con la B',

    -- Resultados agregados
    biomasa_final       DECIMAL(8,2) NOT NULL DEFAULT 0,
    altura_final        DECIMAL(6,2) NOT NULL DEFAULT 0,
    hojas_final         SMALLINT     NOT NULL DEFAULT 0,
    dias_a_madurez      SMALLINT     NULL COMMENT 'Día en que alcanzó el 95 % de K; NULL si no llegó',
    estres_promedio     DECIMAL(5,2) NOT NULL DEFAULT 0,
    icr_promedio        DECIMAL(8,5) NOT NULL DEFAULT 0 COMMENT 'Índice de crecimiento relativo medio',
    eficiencia          DECIMAL(8,4) NOT NULL DEFAULT 0 COMMENT 'Biomasa final / días a madurez',

    creada_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sim_especie FOREIGN KEY (especie_id)
        REFERENCES especies(id) ON DELETE CASCADE,
    KEY idx_sim_especie (especie_id),
    KEY idx_sim_grupo (grupo_ab),
    KEY idx_sim_biomasa (biomasa_final DESC)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- mediciones
-- Una fila por día simulado. Es la serie temporal que alimenta las gráficas.
-- --------------------------------------------------------------------------
CREATE TABLE mediciones (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    simulacion_id       INT          NOT NULL,
    dia                 SMALLINT     NOT NULL,

    biomasa             DECIMAL(8,3) NOT NULL COMMENT 'gramos',
    altura              DECIMAL(6,3) NOT NULL COMMENT 'unidades de escena',
    n_hojas             SMALLINT     NOT NULL DEFAULT 0,
    n_ramas             TINYINT      NOT NULL DEFAULT 0,

    estres_hidrico      DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_termico      DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_luminico     DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_nutricional  DECIMAL(5,2) NOT NULL DEFAULT 0,
    estres_total        DECIMAL(5,2) NOT NULL DEFAULT 0,

    icr                 DECIMAL(8,5) NOT NULL DEFAULT 0,

    CONSTRAINT fk_med_sim FOREIGN KEY (simulacion_id)
        REFERENCES simulaciones(id) ON DELETE CASCADE,
    UNIQUE KEY uq_med_sim_dia (simulacion_id, dia),
    KEY idx_med_sim (simulacion_id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- decisiones
-- Recomendaciones que emitió el motor durante la corrida. Quedan guardadas
-- para poder auditar por qué se sugirió cada acción y en qué día.
-- --------------------------------------------------------------------------
CREATE TABLE decisiones (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    simulacion_id       INT          NOT NULL,
    dia                 SMALLINT     NOT NULL,

    tipo                ENUM('general','riego','temperatura','luz','nutricion','co2','cosecha','especie')
                        NOT NULL,
    severidad           ENUM('info','aviso','critico') NOT NULL DEFAULT 'info',
    mensaje             VARCHAR(255) NOT NULL,
    valor_sugerido      VARCHAR(80)  NULL,

    creada_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dec_sim FOREIGN KEY (simulacion_id)
        REFERENCES simulaciones(id) ON DELETE CASCADE,
    KEY idx_dec_sim (simulacion_id),
    KEY idx_dec_sev (severidad)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------------
-- Vista de apoyo para los reportes de eficiencia por especie
-- --------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_eficiencia_especie AS
SELECT
    e.id                              AS especie_id,
    e.nombre_comun,
    e.nombre_cientifico,
    COUNT(s.id)                       AS n_simulaciones,
    ROUND(AVG(s.biomasa_final), 2)    AS biomasa_media,
    ROUND(AVG(s.estres_promedio), 2)  AS estres_medio,
    ROUND(AVG(s.dias_a_madurez), 1)   AS dias_madurez_medio,
    ROUND(AVG(s.eficiencia), 4)       AS eficiencia_media
FROM especies e
LEFT JOIN simulaciones s ON s.especie_id = e.id
GROUP BY e.id, e.nombre_comun, e.nombre_cientifico;
