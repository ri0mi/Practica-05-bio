# Práctica 05 — Laboratorio Bioinformático de Cultivo

Ricardo Melgoza y Rebeca Arciga

Simulador de crecimiento vegetal conectado a MySQL por una API REST en PHP.
Toma la planta procedural de la Práctica 04 y la convierte en una herramienta de
análisis: elige una especie del catálogo, configura el ambiente, ve crecer la
planta en 3D, compara dos escenarios A/B y guarda cada corrida para auditarla.

## Las tres capas

| Capa | Archivos | Qué hace |
|---|---|---|
| Presentación | `index.html`, `style.css`, `js/escena.js`, `js/graficas.js` | Visor 3D, paneles, gráficas Chart.js |
| Lógica | `js/modelos.js`, `js/motor.js`, `js/app.js` | Modelos matemáticos, estrés, decisiones, orquestación |
| Datos | `api/`, `database/` | API REST con FlightPHP sobre MySQL |

## Instalación con XAMPP

**1. Copiar el proyecto**

Ponlo en `C:\xampp\htdocs\practica05`. La ruta importa: la API se busca en
`api/` relativo a `index.html`.

**2. Crear la base de datos**

Arranca Apache y MySQL en el panel de XAMPP, abre `http://localhost/phpmyadmin`
y en la pestaña **Importar** carga, en este orden:

```
database/schema.sql
database/seed.sql
```

O desde la terminal:

```bash
C:\xampp\mysql\bin\mysql -u root --default-character-set=utf8mb4 < database/schema.sql
C:\xampp\mysql\bin\mysql -u root --default-character-set=utf8mb4 < database/seed.sql
```

> El `--default-character-set=utf8mb4` evita que los acentos entren doblemente
> codificados. Los dos scripts ya traen `SET NAMES utf8mb4;` por si el cliente
> no lo respeta.

> **Si ya tenías la base creada de antes** y no quieres perder tus simulaciones
> guardadas, no vuelvas a importar: corre solo la migración, que añade la
> columna `forma` sin tocar el resto.
>
> ```bash
> C:\xampp\mysql\bin\mysql -u root --default-character-set=utf8mb4 < database/migracion-formas.sql
> ```

**3. Instalar FlightPHP**

Es la única dependencia de la API. Hay dos caminos y los dos sirven.

*Con Composer:*

```bash
cd api
composer install
```

Si PowerShell dice que `composer` no se reconoce, instálalo con el PHP que ya
trae XAMPP:

```powershell
cd C:\xampp\htdocs
C:\xampp\php\php.exe -r "copy('https://getcomposer.org/installer','composer-setup.php');"
C:\xampp\php\php.exe composer-setup.php
cd C:\xampp\htdocs\practica05\api
C:\xampp\php\php.exe C:\xampp\htdocs\composer.phar install
```

*Sin Composer:*

Descarga `github.com/flightphp/core` como ZIP, ábrelo y copia **la carpeta
`flight` que está dentro** a `api/flight`. Debe quedar
`api/flight/autoload.php`. `api/index.php` acepta las dos ubicaciones.

**4. Abrir**

```
http://localhost/practica05/
```

El chip de la esquina superior derecha debe decir **«API conectada · 6 especies»**.
Si dice «API sin conexión», abre `http://localhost/practica05/api/especies` en el
navegador: ahí se ve el error exacto de PHP o de MySQL.

### Si tu MySQL tiene contraseña

Edita `api/config.php`:

```php
const DB_USER = 'root';
const DB_PASS = 'tu_password';
```

## La base de datos

Cuatro tablas y una vista:

- **`especies`** — catálogo. Guarda los parámetros del modelo (`r`, `K`, biomasa
  inicial), las condiciones óptimas de cada variable y la **tolerancia**: cuánta
  desviación respecto al óptimo satura el estrés en 100. También lleva la
  columna **`forma`**, que decide con qué silueta dibuja la escena 3D a la
  especie, más el color de pétalos y hojas.
- **`simulaciones`** — una fila por corrida, con su configuración y sus
  resultados agregados. `escenario` y `grupo_ab` emparejan las corridas A y B.
- **`mediciones`** — la serie temporal, una fila por día. Es lo que alimenta las
  gráficas.
- **`decisiones`** — las recomendaciones que emitió el motor, con su severidad.
  Quedan guardadas para poder auditar por qué se sugirió cada acción.
- **`v_eficiencia_especie`** — vista que promedia biomasa, estrés y eficiencia
  por especie. El reporte de eficiencia es un `SELECT` directo sobre ella.

Las mediciones y decisiones se borran solas con su simulación por
`ON DELETE CASCADE`.

## La API

Todas las respuestas tienen la forma `{ ok: true, datos: ... }` o
`{ ok: false, error: "..." }`, con el código HTTP correspondiente.

| Método | Ruta | Qué devuelve |
|---|---|---|
| GET | `/api/especies` | Catálogo completo |
| GET | `/api/especies/{id}` | Una especie |
| POST | `/api/especies` | Alta de especie |
| GET | `/api/simulaciones` | Historial (`?especie=`, `?grupo=`, `?limite=`) |
| GET | `/api/simulaciones/{id}` | Corrida con sus mediciones y decisiones |
| POST | `/api/simulaciones` | Guarda corrida + mediciones + decisiones |
| DELETE | `/api/simulaciones/{id}` | Borra en cascada |
| GET | `/api/comparar?a=1&b=2` | Las dos corridas y un veredicto |
| GET | `/api/reportes/resumen` | KPIs globales |
| GET | `/api/reportes/top-biomasa` | Ranking por biomasa |
| GET | `/api/reportes/eficiencia` | Eficiencia por especie |
| GET | `/api/reportes/alertas` | Decisiones de aviso y críticas |
| GET | `/api/reportes/csv?simulacion=1` | Descarga CSV |

El `POST /api/simulaciones` guarda las tres tablas **en una transacción**: si
falla la inserción de una medición, se deshace todo. Una simulación sin sus
mediciones no sirve de nada.

### Por qué los controladores no conocen Flight

`api/index.php` es el único archivo que importa el framework: define las rutas y
traduce excepciones a códigos HTTP. Los controladores reciben parámetros y
devuelven arreglos. Eso permite probar la lógica sin levantar un servidor, y
cambiar de framework tocando un solo archivo.

## Los modelos de crecimiento

Los cuatro están en `js/modelos.js` y devuelven la biomasa en gramos para un día `t`.

| Modelo | Fórmula | Cuándo sirve |
|---|---|---|
| Lineal | `N(t) = a·t + b` | Referencia de comparación |
| Exponencial | `N(t) = N₀·e^(r·t)` | Fase juvenil sin competencia |
| Logístico (Verhulst) | `dN/dt = r·N·(1 − N/K)` | El estándar para biomasa vegetal |
| Gompertz | `N(t) = K·exp(−exp(−r·(t − t₀)))` | Curva en S asimétrica, ciclos cortos |

Como el ambiente se mantiene fijo durante una corrida, `r` es constante y se usa
la **solución analítica** de la ecuación de Verhulst en vez de integrarla paso a
paso. En Gompertz, `t₀` no se le pide al usuario: se deduce para que la curva
arranque exactamente en `N₀`, despejando de `N(0) = N₀` → `t₀ = ln(ln(K/N₀))/r`.

## El motor de estrés

Para cada variable, el índice de 0 a 100 es la desviación respecto al óptimo de
la especie dividida entre su tolerancia. El total pondera agua (.32),
temperatura (.30), luz (.20) y nutrientes (.18), **pero nunca baja del 65 % de
la peor variable**: es la ley del mínimo de Liebig. Sin esa corrección, una
temperatura letal de 45 °C con todo lo demás perfecto daría un estrés de 30/100,
que no describe lo que le pasa a la planta.

El estrés actúa en dos frentes:

- **Sobre la velocidad** — `r_efectiva = r · (1 − 0.85 · estrés/100)`. La planta
  tarda más en llegar.
- **Sobre el techo** — `K_efectiva = K · (1 − 0.45 · estrés/100)`. Y además
  rinde menos. Un tomate con déficit hídrico no da lo mismo más tarde: da menos.

El CO₂ no genera estrés, modifica la capacidad de carga entre −30 % y +25 %, que
es el rango de enriquecimiento reportado en invernadero.

## Las siluetas

Cada especie se dibuja con su propia geometría, no con un modelo genérico
repintado. La silueta sale de la columna `forma` de la tabla `especies`, así que
dar de alta una especie nueva con la forma correcta basta para que la escena
sepa dibujarla: no hay que tocar JavaScript.

| `forma` | Especies | Qué la distingue |
|---|---|---|
| `maiz` | Maíz | Caña única con nudos, hojas acintadas dísticas, penacho terminal y mazorca con brácteas |
| `trigo` | Trigo | Mata de cuatro macollos, hojas lineales erectas, espiga de granos con aristas |
| `tomate` | Tomate | Arbusto ramificado, hoja compuesta de cinco folíolos, flor amarilla y fruto rojo con sépalos |
| `frijol` | Frijol | Tallo voluble en hélice sobre una guía, hojas trifoliadas, flor papilionácea y vainas |
| `roseta` | Lechuga | Cuatro coronas de hojas cada vez más erectas; las internas forman el cogollo. Sin flor |
| `arabidopsis` | Arabidopsis | Roseta basal, bohordo delgado, flores de cuatro pétalos en cruz y silicuas |

Las piezas propias de cada forma aparecen en el panel de información al hacer
clic sobre ellas, con su geometría y su aporte a la biomasa: una mazorca pesa
mucho más que un pétalo, y el reparto está en `CONTRIBUCION` dentro de
`js/motor.js`.

## La parcela

El deslizador **Macetas** repite el mismo ejemplar de 1 a 4 veces. Las macetas
se reparten en una rejilla con un escalón en Z para que no queden en fila recta,
y cada una recibe un giro y una escala ligeramente distintos para que no
parezcan calcadas. Todas crecen con el mismo reloj.

El indicador **Biomasa de la parcela** multiplica la biomasa por el número de
macetas. Es una suma, no un modelo de densidad: **no se simula la competencia
entre plantas vecinas**, que en un cultivo real reduciría el rendimiento por
planta al aumentar la densidad. Se deja explícito porque es justo el tipo de
cosa que no debe quedar implícita en un simulador.

## El encuadre de la cámara

Las siluetas van de 1.3 unidades de alto (lechuga) a más de 4 (maíz con
penacho), así que una cámara fija dejaría unas fuera de cuadro y otras
diminutas. `Escena.encuadrar()` resuelve esto midiendo la caja envolvente de lo
que hay en escena y calculando la distancia necesaria contra el campo de visión,
corregido por la relación de aspecto del lienzo.

El detalle que importa: para medir se fuerza el crecimiento al 100 %, se llama a
`updateMatrixWorld(true)` y recién entonces se usa `Box3.setFromObject`. Three.js
solo actualiza las matrices de mundo antes de dibujar, así que medir sin ese paso
devuelve la caja del frame anterior. Después se restaura el crecimiento real.

## Qué hace cada vista

**Simulador** — elige especie y modelo, mueve los deslizadores, elige cuántas
macetas quieres y ejecuta. La planta 3D crece en función de la biomasa calculada, las hojas amarillean con el
estrés (uniform `uEstres` del shader) y el tablero muestra día, biomasa, altura,
hojas, ramas, ICR, estrés y predicción de cosecha. Al hacer clic en una parte se
ve su geometría, su porcentaje de crecimiento, su altura real sobre el suelo
(`getWorldPosition`), el estrés asociado y su aporte a la biomasa total.

**Comparar A/B** — fija dos configuraciones con los botones *Fijar como A* y
*Fijar como B*. La vista contrasta las dos tarjetas, emite un veredicto y
muestra **las dos plantas creciendo lado a lado**, con el mismo canvas que se
muda de vista para no abrir un segundo contexto WebGL.

**Historial** — las corridas guardadas en MySQL. Se pueden cargar para
reproducirlas, descargar como CSV o borrar.

**Reportes** — KPIs globales, top 5 por biomasa, eficiencia por especie y las
alertas registradas.

## Estructura

```
practica05/
├── index.html
├── style.css
├── captura.png / captura-parcela.png / captura-comparar.png
├── captura-lechuga.png / captura-reportes.png
├── README.md
├── RESPUESTAS.md
├── api/
│   ├── .htaccess              manda las rutas a index.php
│   ├── index.php              rutas FlightPHP
│   ├── config.php             PDO y utilidades
│   ├── diagnostico.php        comprueba PHP, Flight, Apache y MySQL
│   ├── vendor/  o  flight/    FlightPHP (Composer o descarga manual)
│   ├── composer.json
│   └── controllers/
│       ├── EspeciesController.php
│       ├── SimulacionesController.php
│       └── ReportesController.php
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── migracion-formas.sql   añade la columna "forma" a una base ya creada
└── js/
    ├── api.js                 cliente fetch
    ├── modelos.js             los cuatro modelos
    ├── motor.js               estrés, biomasa, ICR, decisiones
    ├── escena.js              Three.js
    ├── graficas.js            Chart.js
    └── app.js                 orquestación
```

## Dependencias

- **Three.js 0.128** y **OrbitControls** desde CDN
- **Chart.js 4.4** desde CDN
- **FlightPHP 3** por Composer
- **PHP 7.4+** con PDO y **MySQL 5.7+**

## Problemas frecuentes

### Lo primero: abre el diagnóstico

```
http://TU_SERVIDOR/practica05/api/diagnostico.php
```

Esa página no depende de Flight ni de MySQL para cargar, y comprueba una por
una las cosas que pueden fallar: versión de PHP, `pdo_mysql`, si existe
`api/vendor`, si `mod_rewrite` está activo, la conexión a la base, cuántas filas
tiene cada tabla y si los acentos se leen bien. Dice cuál falla.

**«API sin conexión»** — en orden de probabilidad:

1. **Falta `composer install` dentro de `api/`.** Sin `api/vendor/` el archivo
   `index.php` muere en la primera línea y Apache devuelve HTML en lugar de
   JSON. Es la causa número uno.
2. **`mod_rewrite` apagado o `AllowOverride None`.** Las rutas de Flight
   (`/especies`) no son archivos reales: sin reescritura Apache contesta su
   propio 404. El `.htaccess` de `api/` resuelve esto cuando el módulo está
   activo; si no lo está, el cliente reintenta solo por
   `api/index.php/especies`, así que la aplicación sigue funcionando.
3. **La base no está importada** o el usuario de MySQL tiene contraseña.
4. **Apache o MySQL apagados** en el panel de XAMPP.

**Acentos rotos (`genÃ©tica`)** — la base se importó con otro juego de
caracteres. Vuelve a importar con `--default-character-set=utf8mb4`.

**`Class "Flight" not found`** — falta FlightPHP. Instálalo con Composer o copia
la carpeta `flight` del ZIP de GitHub dentro de `api/` (paso 3 de la instalación).

**La escena 3D no aparece** — sin internet no cargan Three.js ni Chart.js desde
el CDN. El resto de la aplicación sí funciona.
