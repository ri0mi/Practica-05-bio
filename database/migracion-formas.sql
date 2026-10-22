-- ==========================================================================
--  MIGRACIÓN · Siluetas por especie
--
--  Añade la columna "forma" a una base que ya estaba creada, sin tocar las
--  simulaciones guardadas. Si vas a importar schema.sql y seed.sql desde
--  cero NO necesitas este archivo: la columna ya viene en ellos.
--
--      mysql -u root --default-character-set=utf8mb4 < database/migracion-formas.sql
-- ==========================================================================

SET NAMES utf8mb4;
USE practica05_bioinformatica;

ALTER TABLE especies
    ADD COLUMN forma ENUM('maiz','trigo','tomate','frijol','roseta','arabidopsis')
        NOT NULL DEFAULT 'tomate'
        COMMENT 'Silueta con la que la escena 3D dibuja la especie'
        AFTER tol_co2;

-- La forma se asigna por nombre científico, que es la clave única de la tabla.
UPDATE especies SET forma = 'maiz'        WHERE nombre_cientifico = 'Zea mays';
UPDATE especies SET forma = 'trigo'       WHERE nombre_cientifico = 'Triticum aestivum';
UPDATE especies SET forma = 'tomate'      WHERE nombre_cientifico = 'Solanum lycopersicum';
UPDATE especies SET forma = 'frijol'      WHERE nombre_cientifico = 'Phaseolus vulgaris';
UPDATE especies SET forma = 'roseta'      WHERE nombre_cientifico = 'Lactuca sativa';
UPDATE especies SET forma = 'arabidopsis' WHERE nombre_cientifico = 'Arabidopsis thaliana';

SELECT nombre_comun, nombre_cientifico, forma FROM especies ORDER BY nombre_comun;
