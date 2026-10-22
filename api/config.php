<?php
/**
 * PRÁCTICA 05 — Conexión a la base de datos y utilidades compartidas.
 *
 * Ajusta las credenciales si tu MySQL de XAMPP tiene contraseña.
 * Por defecto XAMPP trae el usuario root sin contraseña.
 */

const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'practica05_bioinformatica';
const DB_USER = 'root';
const DB_PASS = '';

/**
 * Devuelve una única conexión PDO para toda la petición.
 * ERRMODE_EXCEPTION hace que cualquier fallo de SQL lance una excepción en vez
 * de devolver false en silencio, que es lo que queremos para poder responder
 * con un código HTTP correcto.
 */
function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                       DB_HOST, DB_PORT, DB_NAME);

        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }

    return $pdo;
}

/**
 * MySQL devuelve los DECIMAL como cadenas. El frontend hace matemáticas con
 * ellos, así que convertimos a número las columnas que lo son.
 */
function numerizar(array $fila, array $columnas): array
{
    foreach ($columnas as $c) {
        if (array_key_exists($c, $fila) && $fila[$c] !== null) {
            $fila[$c] = 0 + $fila[$c];
        }
    }
    return $fila;
}

function numerizarTodas(array $filas, array $columnas): array
{
    return array_map(fn($f) => numerizar($f, $columnas), $filas);
}

/** Columnas numéricas de cada tabla, para no repetirlas en los controladores. */
const NUM_ESPECIE = ['id','r_default','k_default','biomasa_inicial','dias_madurez',
    'luz_optima','agua_optima','temp_optima','nutrientes_optimo','co2_optimo',
    'tol_luz','tol_agua','tol_temp','tol_nutrientes','tol_co2','n_ramas','altura_max_u'];

const NUM_SIMULACION = ['id','especie_id','r','k','dias','luz','agua','temperatura',
    'nutrientes','co2','biomasa_final','altura_final','hojas_final','dias_a_madurez',
    'estres_promedio','icr_promedio','eficiencia'];

const NUM_MEDICION = ['id','simulacion_id','dia','biomasa','altura','n_hojas','n_ramas',
    'estres_hidrico','estres_termico','estres_luminico','estres_nutricional',
    'estres_total','icr'];

/** Excepción con código HTTP, para distinguir un 404 de un 500. */
class ApiError extends Exception
{
    public int $http;

    public function __construct(string $mensaje, int $http = 400)
    {
        parent::__construct($mensaje);
        $this->http = $http;
    }
}
