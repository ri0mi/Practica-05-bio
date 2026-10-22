# Práctica 05 — Respuestas y justificación técnica

Ricardo Melgoza y Rebeca Arciga

Documento de respaldo del proyecto. Explica las decisiones de diseño de la
aplicación de tres capas y responde a los objetivos planteados en la práctica.

---

## 1. ¿Cómo se integran las tres capas y por qué así?

| Capa | Responsabilidad | No se encarga de |
|---|---|---|
| Presentación (Three.js, Chart.js, HTML/CSS) | Dibujar la planta, las gráficas y los paneles | Calcular biomasa ni hablar con MySQL |
| Lógica (`js/modelos.js`, `js/motor.js`, `js/app.js`) | Modelos de crecimiento, índices de estrés, decisiones, orquestación | Saber cómo se guarda un registro |
| Datos (`api/`, `database/`) | Persistencia, consultas, agregados | Saber que existe una escena 3D |

La comunicación es en un solo sentido por capa: la presentación pide a la lógica,
la lógica pide a la capa de datos a través de `js/api.js`, y la capa de datos solo
responde JSON. Ningún archivo de la escena 3D contiene `fetch`, y ningún
controlador PHP sabe nada de Three.js.

La ventaja práctica se vio al depurar: cuando el modelo daba biomasas idénticas
en A y B, el error estaba contenido en `motor.js` y se pudo probar con Node sin
levantar Apache ni MySQL.

## 2. ¿Por qué el cálculo está en el cliente y no en PHP?

El simulador necesita recalcular la morfología de la planta **en cada frame**
(60 veces por segundo) para que el crecimiento se vea continuo. Mandar eso al
servidor sería una petición HTTP por frame.

La división quedó así:

- **Cliente**: la simulación completa, que es determinista y barata.
- **Servidor**: lo que requiere estado compartido y persistencia — guardar la
  corrida, consultar el historial, calcular agregados entre corridas
  (`v_eficiencia_especie`, top de biomasa, alertas) y emitir el veredicto
  canónico de una comparación A/B guardada.

Los agregados sí van en SQL porque son operaciones de conjunto: `AVG`, `COUNT` y
`GROUP BY` sobre todas las corridas de todas las sesiones. Eso no se puede
calcular en el navegador porque el navegador solo conoce su propia corrida.

## 3. ¿Qué modelo de crecimiento conviene y por qué hay cuatro?

Los cuatro están implementados para poder **comparar**, que es el objetivo
analítico de la práctica:

| Modelo | Comportamiento | Problema que tiene |
|---|---|---|
| Lineal | Incremento constante | No existe en biología; sirve de línea base |
| Exponencial | Crecimiento sin freno | Válido solo en la fase juvenil; diverge |
| Logístico (Verhulst) | S simétrica con techo `K` | El estándar para biomasa vegetal |
| Gompertz | S asimétrica, inflexión temprana | Mejor para ciclos cortos y senescencia |

El que se usa por defecto es el **logístico**, porque la biomasa vegetal está
limitada por recursos finitos (espacio radicular, nutrientes, luz interceptada) y
eso es exactamente lo que describe el término `(1 − N/K)`.

Dos decisiones de implementación:

- **Solución analítica en vez de integración numérica.** El ambiente se mantiene
  fijo durante una corrida, así que `r` es constante y se puede usar
  `N(t) = K / (1 + ((K − N₀)/N₀)·e^(−r·t))` directamente. Es exacto y no acumula
  error de paso, a diferencia de un Euler explícito.
- **`t₀` de Gompertz se deduce, no se pide.** Si el usuario lo eligiera, la curva
  no arrancaría en la biomasa inicial de la especie. Despejando de `N(0) = N₀`
  sale `t₀ = ln(ln(K/N₀))/r`, y así los cuatro modelos empiezan en el mismo punto
  y la comparación es honesta.

## 4. ¿Cómo se calcula el estrés y por qué no es un promedio simple?

Para cada variable:

```
índice = min(100, |valor − óptimo| / tolerancia × 100)
```

La tolerancia viene de la tabla `especies`, no está fija en el código: un
Arabidopsis y un maíz no toleran lo mismo.

El total **no** es el promedio ponderado a secas:

```js
const ponderado = 0.32*hidrico + 0.30*termico + 0.20*luminico + 0.18*nutricional;
const peor      = Math.max(hidrico, termico, luminico, nutricional);
const total     = Math.max(ponderado, peor * 0.65);
```

El piso `peor * 0.65` es la **ley del mínimo de Liebig**: el crecimiento lo limita
el recurso más escaso, no el promedio de los recursos. Esto se agregó porque
durante las pruebas una temperatura letal de 45 °C con todo lo demás perfecto
daba un estrés total de 30/100, que describía mal lo que le pasa a la planta.

Los pesos reflejan que el déficit hídrico y el térmico cierran estomas y detienen
la fotosíntesis de inmediato, mientras que una carencia nutricional tarda días en
manifestarse.

## 5. ¿Cómo afecta el estrés al resultado?

En dos frentes, y eso importa:

```js
r_efectiva = r * (1 - 0.85 * estrés/100);   // tarda más
K_efectiva = K * (1 - 0.45 * estrés/100);   // y rinde menos
```

En la primera versión el estrés solo tocaba `r`. El resultado era que los
escenarios A y B terminaban en la misma biomasa final (~420 g) y solo cambiaba
cuándo llegaban — una conclusión falsa. Un tomate con déficit hídrico no produce
lo mismo más tarde: produce menos, porque aborta flores y reduce el área foliar.
De ahí el factor sobre `K`.

El CO₂ se trata distinto: no genera estrés, modula la capacidad de carga entre
−30 % y +25 %, que es el rango de respuesta al enriquecimiento reportado en
invernadero. Es un factor de rendimiento, no un factor de daño.

## 6. ¿Qué aporta la prueba A/B y cómo se garantiza que sea comparable?

Fijar dos configuraciones (**Fijar como A** / **Fijar como B**) permite aislar una
variable: mismo modelo, misma especie, mismos parámetros genéticos, y solo cambia
el riego. El veredicto reporta diferencia de biomasa, diferencia de días a
madurez y diferencia de estrés.

Para que la comparación sea válida:

- las dos corridas comparten `grupo_ab` en la base, así que quedan emparejadas y
  auditables;
- las dos plantas se animan **en el mismo canvas y con el mismo reloj**
  (`avanzarComparacion()`), porque mostrarlas en dos lienzos con dos
  requestAnimationFrame distintos las desincronizaría visualmente;
- el veredicto lo emite el servidor en `GET /api/comparar`, no el navegador, para
  que dos personas que consulten las mismas corridas lean la misma conclusión.

## 7. ¿Por qué un solo contexto WebGL?

Cada `WebGLRenderingContext` cuesta memoria de GPU y los navegadores limitan
cuántos se pueden tener abiertos (típicamente 8–16); al pasarse, se destruyen los
más viejos y la escena se queda en negro.

La solución fue mover el nodo `#col-escena` entre vistas con `moverEscena()` en
vez de crear un segundo lienzo para la vista Comparar. Un contexto, un bucle de
render, cero fugas. El efecto secundario agradable es que la cámara conserva su
orientación al cambiar de pestaña.

## 8. ¿Cómo se garantiza la integridad de los datos?

Tres mecanismos:

- **Transacción en el `POST`.** Una simulación se guarda junto con sus mediciones
  y sus decisiones dentro de un `beginTransaction()`. Si falla la inserción de
  una medición se hace `rollBack()` completo. Una simulación sin su serie
  temporal no sirve para nada y ensuciaría los reportes.
- **`ON DELETE CASCADE`.** Borrar una corrida borra sus mediciones y decisiones.
  Se verificó: al borrar una simulación, las mediciones pasaron de 29 a 24 sin
  dejar filas huérfanas.
- **Tipos estrictos.** `ENUM` en `decisiones.tipo` y `simulaciones.escenario`,
  `DECIMAL` en lugar de `FLOAT` para las biomasas, y `utf8mb4` en toda la base.

Sobre `DECIMAL`: PDO lo devuelve como **cadena**, no como número. Por eso existe
`numerizar()` en `config.php`, que convierte las columnas numéricas antes de
serializar el JSON. Sin eso, el cliente recibía `"420.00"` y `"420.00" + 1` da
`"420.001"` en JavaScript.

## 9. ¿Por qué los controladores no conocen FlightPHP?

`api/index.php` es el único archivo que menciona `Flight`. Define las 16 rutas y
traduce excepciones a códigos HTTP (`ApiError` lleva su propio `$http`; cualquier
otro `Throwable` se convierte en 500). Los controladores reciben parámetros
simples y devuelven arreglos.

Dos beneficios concretos: la lógica se puede probar sin levantar un servidor web,
y cambiar de framework toca un archivo. Durante el desarrollo esto resultó útil
porque hubo que probar los controladores con un router mínimo propio.

## 10. ¿Cómo se validaron las decisiones de visualización?

La paleta de las gráficas se validó con un script de contraste y separación para
daltonismo en lugar de elegir colores a ojo. Los colores finales
(`A #3987e5`, `B #d95926`, y los cuatro de estrés) pasan la separación mínima en
deuteranopía y protanopía sobre el fondo oscuro `#161b22`.

Además, la identidad nunca depende solo del color: las series llevan **etiqueta
directa** (plugin `etiquetasDirectas`), las barras de estrés muestran su valor
dentro de la barra, y existe un botón **Ver tabla de datos** que expone las
mediciones como tabla HTML para quien no pueda leer la gráfica.

## 10 bis. ¿Por qué cada especie tiene su propia silueta?

La primera versión dibujaba la misma planta para las seis especies y solo
cambiaba el color de hoja y pétalo. Funcionaba, pero contradecía el propósito
de la herramienta: si el catálogo distingue un maíz de una lechuga en sus
parámetros, la representación también tiene que distinguirlos.

La solución **no** fue escribir seis funciones sueltas en JavaScript, sino
añadir la columna `forma` a la tabla `especies`. La escena consulta ese valor y
elige el constructor correspondiente. Dar de alta una especie nueva con
`forma = 'roseta'` basta para que se dibuje bien sin tocar una línea de código,
que es la misma lógica que ya se aplicaba a `r`, `K` y los colores: **lo que
define a la especie vive en la base, no en el cliente**.

Las seis formas comparten la maquinaria (maceta, shader de hojas, sistema de
etapas de crecimiento) y se diferencian en la geometría:

| Forma | Rasgo botánico que se modela |
|---|---|
| `maiz` | Caña única con nudos y hojas dísticas; penacho masculino arriba y mazorca lateral |
| `trigo` | Macollamiento: varias cañas desde una semilla, cada una con su espiga aristada |
| `tomate` | Hoja compuesta de cinco folíolos y fruto en baya con cáliz persistente |
| `frijol` | Tallo voluble que trepa en hélice sobre una guía; hoja trifoliada y legumbre |
| `roseta` | Hojas en coronas concéntricas sin tallo alargado: el cogollo de la lechuga |
| `arabidopsis` | Roseta basal más bohordo floral con flores en cruz y silicuas |

Dos decisiones técnicas que valen la pena:

- **El trepado del frijol se modela con segmentos, no con una curva.** El tallo
  son siete cilindros colocados en una hélice, cada uno con su propia etapa de
  crecimiento. Como aparecen en orden, la planta parece trepar en vez de
  estirarse. Una curva continua habría sido más fiel pero no se podría animar
  con el mismo sistema de etapas que usa el resto.
- **Las hojas del maíz van giradas 1.6 rad.** Son dísticas, es decir que nacen
  alternadas a 180°, lo cual las deja a todas en un mismo plano. Si ese plano
  coincide con la línea de visión, las hojas se ven en escorzo y la planta
  parece una caña pelada. El giro orienta el plano de lado a lado de la cámara.

## 10 ter. ¿Qué significa el deslizador de macetas?

Repite el mismo ejemplar de 1 a 4 veces para ver la parcela en vez de la planta
suelta. Las macetas se colocan en rejilla con un escalón en Z y con giro y
escala ligeramente distintos, porque cuatro copias idénticas en fila recta se
leen como un error de render.

El indicador **Biomasa de la parcela** es una multiplicación, y eso hay que
decirlo claro: **no se modela la competencia entre plantas vecinas**. En un
cultivo real, subir la densidad aumenta el rendimiento por superficie pero lo
reduce por planta, hasta que la competencia por luz y agua lo revierte. Meter
eso implicaría un término de densidad en `K_efectiva` y datos de marco de
plantación por especie. Se dejó fuera a propósito y se documenta, en vez de
dejar que el número sugiera una precisión que no tiene.

## 11. ¿Qué aporta el motor de decisiones?

Convierte números en acciones. Para cada variable con índice por encima de
30 (aviso) o 60 (crítico) emite una decisión con su severidad, su día y su texto.
`proximaAccion()` elige la más urgente y la muestra arriba, con el borde en rojo
cuando es crítica.

Lo importante es que las decisiones **se guardan en la tabla `decisiones`**, no
solo se muestran. Eso permite auditar después por qué el sistema recomendó algo,
y es lo que alimenta el reporte de alertas. Un sistema de apoyo a la decisión que
no registra sus recomendaciones no se puede evaluar.

## 12. ¿Cómo se verificó que todo funciona?

- **Matemáticas**: los cuatro modelos arrancan exactamente en `N₀`; la inflexión
  del logístico cae en el día 43 con `N ≈ K/2 = 215.7 g`, como debe.
- **API**: los 16 endpoints se ejercitaron uno por uno, incluyendo el 404 de una
  especie inexistente, la descarga del CSV, la transacción (creó una corrida con
  5 mediciones y 2 decisiones) y el rollback (no dejó filas huérfanas).
- **Interfaz**: recorrido completo sin errores de consola — chip
  «API conectada · 6 especies», escenario con estrés 52/100 y borde crítico,
  guardado con 23 mediciones, veredicto «Gana el escenario B: 112.41 g más de
  biomasa y madura 46 días antes», dos plantas en escena, historial con sus
  filas, 6 KPIs, 4 entradas de top, eficiencia y 2 alertas, y el raycasting
  devolviendo el aporte de la parte seleccionada.

## 13. ¿Qué limitaciones tiene y qué seguiría?

**Limitaciones reconocidas**

- El ambiente es constante durante una corrida. Un ciclo real tiene variación
  diaria de temperatura y luz; modelarla exigiría integración numérica paso a
  paso en vez de la solución analítica.
- Los parámetros `r` y `K` del catálogo son valores de referencia agronómica, no
  resultados de un ajuste a datos propios.
- La API no tiene autenticación: es un proyecto de laboratorio en `localhost`.

**Siguiente paso natural**

Ajustar `r` y `K` por mínimos cuadrados a partir de las mediciones reales
guardadas en la base, que es precisamente para lo que sirve tener la serie
temporal persistida. Con eso el simulador dejaría de usar parámetros de libro y
empezaría a usar los del invernadero propio.
