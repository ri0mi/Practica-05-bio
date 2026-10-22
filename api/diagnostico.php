<?php
/**
 * PRÁCTICA 05 — DIAGNÓSTICO DE LA API
 *
 * Página suelta que no depende de Flight ni de la base de datos para cargar.
 * Comprueba una por una las cuatro cosas que pueden hacer que el chip diga
 * «API sin conexión» y dice exactamente cuál falla.
 *
 *     http://TU_SERVIDOR/practica05/api/diagnostico.php
 */

header('Content-Type: text/html; charset=utf-8');

$pruebas = [];

/** Registra el resultado de una comprobación. */
function revisar(string $nombre, callable $fn): void
{
    global $pruebas;
    try {
        [$ok, $detalle] = $fn();
    } catch (Throwable $e) {
        [$ok, $detalle] = [false, get_class($e) . ': ' . $e->getMessage()];
    }
    $pruebas[] = ['nombre' => $nombre, 'ok' => $ok, 'detalle' => $detalle];
}

// 1. PHP y sus extensiones -------------------------------------------------
revisar('PHP 7.4 o superior', fn() => [
    version_compare(PHP_VERSION, '7.4.0', '>='),
    'Versión detectada: ' . PHP_VERSION,
]);

revisar('Extensión pdo_mysql', fn() => [
    extension_loaded('pdo_mysql'),
    extension_loaded('pdo_mysql')
        ? 'Cargada'
        : 'Falta. Descomenta extension=pdo_mysql en php.ini y reinicia Apache.',
]);

// 2. Dependencias de Composer ---------------------------------------------
revisar('FlightPHP disponible', function () {
    $opciones = [
        'Composer (api/vendor)'       => __DIR__ . '/vendor/autoload.php',
        'descarga manual (api/flight)' => __DIR__ . '/flight/autoload.php',
    ];
    foreach ($opciones as $comoSeInstalo => $ruta) {
        if (file_exists($ruta)) {
            require_once $ruta;
            return [class_exists('Flight'), class_exists('Flight')
                ? "Cargado por $comoSeInstalo"
                : "Existe $ruta pero la clase Flight no aparece."];
        }
    }
    return [false, 'No está ni api/vendor/autoload.php ni api/flight/autoload.php. '
                 . 'Instala con «composer install» dentro de api/, o descarga '
                 . 'github.com/flightphp/core y copia su carpeta «flight» dentro de api/.'];
});

// 3. Reescritura de rutas --------------------------------------------------
revisar('mod_rewrite activo en Apache', function () {
    if (function_exists('apache_get_modules')) {
        $ok = in_array('mod_rewrite', apache_get_modules(), true);
        return [$ok, $ok
            ? 'Activo'
            : 'Apagado. Descomenta LoadModule rewrite_module en httpd.conf. Mientras tanto la API funciona por api/index.php/especies.'];
    }
    return [true, 'No se puede comprobar desde PHP (no es mod_php). Si la ruta limpia falla, el cliente usa api/index.php/… automáticamente.'];
});

revisar('Se permite el .htaccess (AllowOverride)', function () {
    $ok = file_exists(__DIR__ . '/.htaccess');
    return [$ok, $ok
        ? 'El archivo api/.htaccess existe. Si las rutas limpias siguen sin funcionar, pon AllowOverride All en httpd.conf para htdocs.'
        : 'Falta api/.htaccess.'];
});

// 4. Base de datos ---------------------------------------------------------
revisar('Conexión a MySQL', function () {
    require_once __DIR__ . '/config.php';
    $pdo = db();
    return [true, 'Conectado a la base ' . DB_NAME . ' como ' . DB_USER];
});

revisar('Tablas y datos cargados', function () {
    require_once __DIR__ . '/config.php';
    $pdo = db();
    $resumen = [];
    foreach (['especies', 'simulaciones', 'mediciones', 'decisiones'] as $tabla) {
        $n = (int) $pdo->query("SELECT COUNT(*) FROM `$tabla`")->fetchColumn();
        $resumen[] = "$tabla: $n";
    }
    $especies = (int) $pdo->query('SELECT COUNT(*) FROM especies')->fetchColumn();
    return [$especies > 0, implode(' · ', $resumen) . ($especies === 0
        ? ' — importa database/seed.sql'
        : '')];
});

revisar('Acentos correctos (utf8mb4)', function () {
    require_once __DIR__ . '/config.php';
    $nombre = (string) db()->query(
        "SELECT nombre_cientifico FROM especies WHERE nombre_cientifico LIKE '%Zea%' LIMIT 1"
    )->fetchColumn();
    if ($nombre === '') {
        return [true, 'Sin datos que comprobar todavía.'];
    }
    $ok = mb_check_encoding($nombre, 'UTF-8');
    return [$ok, "Leído: $nombre"];
});

$fallos = count(array_filter($pruebas, fn($p) => !$p['ok']));
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Diagnóstico de la API · Práctica 05</title>
    <style>
        body { font-family: system-ui, Segoe UI, Arial, sans-serif; background:#0d1117;
               color:#c9d1d9; max-width:760px; margin:40px auto; padding:0 20px; font-size:14px; }
        h1 { font-size:18px; color:#e6edf3; }
        .resumen { padding:12px 14px; border-radius:9px; margin:16px 0 22px;
                   border-left:3px solid #3fb950; background:#161b22; }
        .resumen.mal { border-left-color:#d03b3b; }
        .prueba { background:#161b22; border:1px solid #2a3340; border-radius:9px;
                  padding:11px 13px; margin-bottom:9px; }
        .prueba b { display:block; color:#e6edf3; font-size:13px; }
        .prueba small { color:#8b98a5; display:block; margin-top:4px; line-height:1.5; }
        .ok b::before  { content:"✔ "; color:#3fb950; }
        .mal b::before { content:"✘ "; color:#d03b3b; }
        .mal { border-color:#58282c; }
        code { background:#1c232c; padding:1px 5px; border-radius:4px; }
    </style>
</head>
<body>
    <h1>Diagnóstico de la API · Práctica 05</h1>

    <div class="resumen <?= $fallos ? 'mal' : '' ?>">
        <?= $fallos === 0
            ? 'Todo en orden. La API debería responder; recarga el simulador.'
            : "Hay $fallos comprobación(es) fallida(s). Arregla la primera marcada en rojo y recarga esta página." ?>
    </div>

    <?php foreach ($pruebas as $p): ?>
        <div class="prueba <?= $p['ok'] ? 'ok' : 'mal' ?>">
            <b><?= htmlspecialchars($p['nombre']) ?></b>
            <small><?= htmlspecialchars((string) $p['detalle']) ?></small>
        </div>
    <?php endforeach; ?>

    <p style="color:#8b98a5; margin-top:22px; line-height:1.6;">
        Prueba directa de un endpoint:
        <code>api/especies</code> · <code>api/index.php/especies</code>
    </p>
</body>
</html>
