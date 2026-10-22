<?php
/**
 * PRÁCTICA 05 — API REST con FlightPHP
 *
 * Único archivo que conoce el framework. Cada ruta valida lo mínimo, llama al
 * controlador correspondiente y devuelve JSON. Los errores se traducen a
 * códigos HTTP: 404 si no existe, 422 si faltan datos, 500 si algo truena.
 *
 * Instalación:
 *     cd api
 *     composer install
 *
 * Prueba rápida:
 *     http://localhost/practica05/api/especies
 */

// --------------------------------------------------------------------------
// Plan B si mod_rewrite está apagado.
// Con reescritura las rutas son  api/especies.  Sin ella hay que pedir
// api/index.php/especies, y entonces Flight vería la ruta "/index.php/especies"
// y no la reconocería. Quitando ese tramo, las dos formas funcionan igual.
// Tiene que ir antes de Flight::start(), que es donde se arma la petición.
// --------------------------------------------------------------------------
if (isset($_SERVER['PATH_INFO']) && isset($_SERVER['REQUEST_URI'])) {
    $_SERVER['REQUEST_URI'] = str_replace('/index.php', '', $_SERVER['REQUEST_URI']);
}

// --------------------------------------------------------------------------
// Carga de FlightPHP.
// Se acepta de dos formas: instalado con Composer (api/vendor) o descargado a
// mano desde github.com/flightphp/core y copiado como api/flight. Si no está
// ninguna, se contesta un JSON legible en vez de un error fatal de PHP, que es
// lo que hacía que el chip dijera "API sin conexion" sin explicar por qué.
// --------------------------------------------------------------------------
$autocargadores = [
    __DIR__ . '/vendor/autoload.php',   // Composer
    __DIR__ . '/flight/autoload.php',   // descarga manual
];

$cargado = false;
foreach ($autocargadores as $ruta) {
    if (file_exists($ruta)) {
        require $ruta;
        $cargado = true;
        break;
    }
}

if (!$cargado) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok'    => false,
        'error' => 'Falta FlightPHP. Ejecuta "composer install" dentro de api/, '
                 . 'o descarga github.com/flightphp/core y copia su carpeta '
                 . '"flight" dentro de api/. Abre api/diagnostico.php para más detalle.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/controllers/EspeciesController.php';
require __DIR__ . '/controllers/SimulacionesController.php';
require __DIR__ . '/controllers/ReportesController.php';

// --------------------------------------------------------------------------
// CORS: el frontend puede estar servido desde otro puerto durante el
// desarrollo, así que permitimos el acceso y respondemos al preflight.
// --------------------------------------------------------------------------
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/** Lee el cuerpo JSON de la petición. */
function cuerpo(): array
{
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo, true);

    if (!is_array($datos)) {
        throw new ApiError('El cuerpo de la petición no es JSON válido', 422);
    }

    return $datos;
}

/** Envuelve un controlador para traducir excepciones a respuestas HTTP. */
function responder(callable $fn): void
{
    try {
        Flight::json(['ok' => true, 'datos' => $fn()]);

    } catch (ApiError $e) {
        Flight::halt($e->http, json_encode(
            ['ok' => false, 'error' => $e->getMessage()],
            JSON_UNESCAPED_UNICODE
        ));

    } catch (Throwable $e) {
        error_log('[API] ' . $e->getMessage());
        Flight::halt(500, json_encode(
            ['ok' => false, 'error' => 'Error interno: ' . $e->getMessage()],
            JSON_UNESCAPED_UNICODE
        ));
    }
}

// --------------------------------------------------------------------------
// ESPECIES
// --------------------------------------------------------------------------
Flight::route('GET /especies', function () {
    responder(fn() => EspeciesController::listar());
});

Flight::route('GET /especies/@id:[0-9]+', function ($id) {
    responder(fn() => EspeciesController::obtener((int) $id));
});

Flight::route('POST /especies', function () {
    responder(fn() => EspeciesController::crear(cuerpo()));
});

// --------------------------------------------------------------------------
// SIMULACIONES
// --------------------------------------------------------------------------
Flight::route('GET /simulaciones', function () {
    responder(fn() => SimulacionesController::listar($_GET));
});

Flight::route('GET /simulaciones/@id:[0-9]+', function ($id) {
    responder(fn() => SimulacionesController::obtener((int) $id));
});

Flight::route('GET /simulaciones/@id:[0-9]+/mediciones', function ($id) {
    responder(fn() => SimulacionesController::mediciones((int) $id));
});

Flight::route('GET /simulaciones/@id:[0-9]+/decisiones', function ($id) {
    responder(fn() => SimulacionesController::decisiones((int) $id));
});

Flight::route('POST /simulaciones', function () {
    http_response_code(201);
    responder(fn() => SimulacionesController::crear(cuerpo()));
});

Flight::route('DELETE /simulaciones/@id:[0-9]+', function ($id) {
    responder(fn() => SimulacionesController::borrar((int) $id));
});

// --------------------------------------------------------------------------
// COMPARACIÓN A/B
// --------------------------------------------------------------------------
Flight::route('GET /comparar', function () {
    responder(function () {
        $a = (int) ($_GET['a'] ?? 0);
        $b = (int) ($_GET['b'] ?? 0);

        if (!$a || !$b) {
            throw new ApiError('Faltan los parámetros a y b', 422);
        }

        return SimulacionesController::comparar($a, $b);
    });
});

// --------------------------------------------------------------------------
// REPORTES
// --------------------------------------------------------------------------
Flight::route('GET /reportes/resumen', function () {
    responder(fn() => ReportesController::resumen());
});

Flight::route('GET /reportes/top-biomasa', function () {
    responder(fn() => ReportesController::topBiomasa((int) ($_GET['limite'] ?? 5)));
});

Flight::route('GET /reportes/eficiencia', function () {
    responder(fn() => ReportesController::eficienciaEspecies());
});

Flight::route('GET /reportes/alertas', function () {
    responder(fn() => ReportesController::alertas((int) ($_GET['limite'] ?? 20)));
});

// El CSV no va envuelto en JSON: se descarga como archivo.
Flight::route('GET /reportes/csv', function () {
    $id = (int) ($_GET['simulacion'] ?? 0);

    try {
        $csv = ReportesController::csv($id);

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=simulacion_$id.csv");
        echo "\xEF\xBB\xBF";   // BOM para que Excel respete los acentos
        echo $csv;

    } catch (ApiError $e) {
        Flight::halt($e->http, json_encode(['ok' => false, 'error' => $e->getMessage()]));
    }
});

// --------------------------------------------------------------------------
// Ruta raíz: índice de la API, útil para comprobar que está viva
// --------------------------------------------------------------------------
Flight::route('GET /', function () {
    Flight::json([
        'ok'   => true,
        'api'  => 'Laboratorio Bioinformático de Cultivo',
        'rutas' => [
            'GET  /especies',
            'GET  /especies/{id}',
            'POST /especies',
            'GET  /simulaciones',
            'GET  /simulaciones/{id}',
            'GET  /simulaciones/{id}/mediciones',
            'GET  /simulaciones/{id}/decisiones',
            'POST /simulaciones',
            'DELETE /simulaciones/{id}',
            'GET  /comparar?a=1&b=2',
            'GET  /reportes/resumen',
            'GET  /reportes/top-biomasa',
            'GET  /reportes/eficiencia',
            'GET  /reportes/alertas',
            'GET  /reportes/csv?simulacion=1',
        ],
    ]);
});

Flight::map('notFound', function () {
    Flight::halt(404, json_encode(['ok' => false, 'error' => 'Ruta no encontrada']));
});

Flight::start();
