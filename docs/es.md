# Tempest

Lleva sus estaciones meteorológicas **WeatherFlow Tempest** a Gladys:
temperatura, humedad, presión, viento, lluvia, rayos, UV, radiación solar y la
previsión de la propia estación, en tiempo real.

> Desarrollada sin el hardware: esta integración sigue la documentación
> oficial de la API de Tempest y respuestas reales de la API publicadas por
> otros proyectos, pero todavía no se ha probado con una estación real. Sus
> comentarios son bienvenidos en el repositorio de GitHub.

Esta integración no está afiliada a WeatherFlow-Tempest, Inc.

## Presentación

La integración se conecta a la **nube de Tempest** con su token de acceso
personal, exactamente como la aplicación Tempest:

- un dispositivo de Gladys por cada estación de su cuenta;
- un **flujo en directo** (WebSocket): una observación por minuto, el viento
  cada 3 segundos, la lluvia y los rayos detectados en el momento en que
  ocurren;
- la **previsión de la estación** («better forecast» de la API de Tempest)
  para hoy, mañana y los próximos días;
- dos disparadores de escena, una acción de escena y un widget de panel.

Todo es de solo lectura: la integración nunca modifica nada en su cuenta
Tempest.

## Requisitos

- Gladys 5.1 o posterior.
- Una estación Tempest (el sensor todo en uno, `ST`) configurada en la
  aplicación Tempest. Los antiguos sensores WeatherFlow AIR y SKY no son
  compatibles.
- Acceso a Internet desde Gladys: los datos vienen de la nube de Tempest.
- Un **token de acceso personal**: inicie sesión en la aplicación web de
  Tempest (tempestwx.com), abra **Ajustes → Autorizaciones de datos** y luego
  **Crear token**. Copie el token.

La Tempest también emite sus datos en la red local (UDP), pero las
integraciones de Gladys se ejecutan en un contenedor aislado que no recibe las
difusiones locales: por eso esta integración usa únicamente la nube.

## Configuración

1. Instale la integración: **Integraciones → Instalar desde GitHub**, o desde
   la tienda.
2. En la pestaña **Configuración**, pegue su **token de acceso personal** y
   guarde.
3. Ajustes opcionales:
   - **Idioma de los textos** (francés por defecto): los nombres de las
     funciones de las estaciones añadidas a partir de ahora, el tipo de
     precipitación, los textos de previsión y las frases de escenas;
   - **Viento instantáneo cada 3 segundos** (activado por defecto): vea más
     abajo.
4. Pulse **Listar mis estaciones** para comprobar el token: el botón lista
   las estaciones de su cuenta e indica cuáles se pueden añadir.
5. Abra la pestaña **Descubrimiento** y añada su estación.

El estado en la parte superior de la pantalla de configuración indica cuándo
el token es rechazado o el servicio Tempest no está disponible.

## El dispositivo estación

Cada estación aporta estas funciones (de solo lectura):

| Función                                        | Unidad            | Origen                   |
| ---------------------------------------------- | ----------------- | ------------------------ |
| Temperatura, sensación térmica, punto de rocío | °C                | cada minuto              |
| Humedad                                        | %                 | cada minuto              |
| Presión (estación), presión (nivel del mar)    | hPa               | cada minuto              |
| Viento medio, ráfagas                          | km/h              | cada minuto              |
| Dirección del viento                           | grados            | cada minuto              |
| Viento instantáneo (3 s)                       | km/h              | cada 3 s, sin historial  |
| Intensidad de lluvia                           | mm/h              | cada minuto              |
| Lluvia de hoy                                  | mm                | cada minuto              |
| Está lloviendo                                 | sí/no             | cada minuto              |
| Tipo de precipitación                          | texto             | ninguna, lluvia, granizo |
| Rayos (última hora)                            | número            | cada minuto              |
| Distancia del último rayo                      | km                | en cada rayo             |
| Índice UV, radiación solar, luminosidad        | índice, W/m², lux | cada minuto              |
| Tensión de la batería                          | V                 | cada minuto              |
| Previsión de hoy / de mañana                   | texto             | cada 30 minutos          |
| Mínima y máxima de hoy / de mañana             | °C                | cada 30 minutos          |
| Probabilidad de lluvia hoy / mañana            | %                 | cada 30 minutos          |

Gladys convierte temperaturas y velocidades a sus unidades preferidas. La
batería es la tensión del supercondensador de la Tempest (entre 2,4 y 2,8 V
aproximadamente; la estación ahorra energía por debajo de 2,45 V), no un
porcentaje. La presión al nivel del mar se calcula a partir de la presión de
la estación y de su altitud, con la fórmula de la documentación de Tempest.

## Widget

Añada el widget **Estación Tempest** a un panel y elija una estación:

- cinco mosaicos en directo: temperatura, humedad, viento, lluvia de hoy,
  presión;
- una lista de estado: condiciones actuales, dirección del viento y ráfagas,
  tendencia de la presión, precipitación, último rayo (distancia y hora),
  índice UV;
- la previsión de los próximos días, o de las próximas horas (ajuste del
  widget).

## Disparadores de escena

En el editor de escenas, categoría **Integraciones**:

- **empieza a llover** — la estación detecta lluvia tras al menos 30 minutos
  sin ella. Se activa una vez por episodio de lluvia, en pocos segundos
  gracias al evento de inicio de lluvia de la propia estación. Filtro
  opcional: la estación. Variable: el nombre de la estación.
- **rayo cercano** — un rayo dentro de la distancia que elija (5, 10, 15, 20,
  30 o 40 km), el primero en 30 minutos a esa distancia. Cuando una tormenta
  se acerca, las distancias más cortas se activan por turno. Variables: la
  distancia del rayo (km) y el nombre de la estación.

Tras un reinicio de la integración, una lluvia ya en curso o un rayo ya
conocido no vuelve a activar los disparadores.

## Acción de escena

**resumen de la previsión** — la previsión de hoy o de mañana de una
estación:

- `summary`: una frase lista, por ejemplo «Hoy: Posible lluvia, de 4 a
  12 °C, 60 % de probabilidad de lluvia.»;
- `condition`, `temperature_min`, `temperature_max`,
  `precipitation_probability`: los valores, para usarlos en condiciones.

La frase sigue el ajuste **Idioma de los textos**.

## Ejemplos de escenas

- **Recoger el toldo cuando empieza a llover**: disparador «empieza a
  llover», acción «cerrar el toldo».
- **Desenchufar el amplificador de antena cuando llega una tormenta**:
  disparador «rayo cercano» a menos de 10 km, acción: apagar el enchufe y
  enviar un mensaje con la distancia del rayo.
- **Parte de la mañana**: a las 7:00, acción «resumen de la previsión» (hoy),
  luego enviar la salida `summary` como mensaje.
- **Saltarse el riego**: a las 6:00, «resumen de la previsión»; si la
  probabilidad de lluvia supera el 60 %, no iniciar el aspersor. La función
  «Lluvia de hoy» también puede detenerlo tras un chaparrón.

## Actualización y uso de los datos

- El flujo en directo mantiene una sola conexión a la nube de Tempest para
  todas sus estaciones; se reconecta solo (de 1 segundo a 5 minutos entre
  intentos) y se reabre si permanece en silencio 3 minutos.
- Mientras el flujo en directo esté caído, cada estación añadida se lee una
  vez por minuto mediante la API REST. La previsión se lee cada 30 minutos
  por estación.
- WeatherFlow pide a las aplicaciones no superar 100 peticiones REST por
  minuto y usuario: la integración hace como máximo unas 3 por minuto y
  estación.
- Solo se siguen las estaciones añadidas a Gladys.
- Un valor que no cambia se vuelve a enviar cada 6 horas, para que nunca
  aparezca «sin valor reciente».
- Los datos de Tempest son para el uso personal del propietario de la
  estación (política de acceso remoto a los datos de Tempest).

## Solución de problemas

- **«El token de acceso de Tempest ha sido rechazado»**: el token se ha
  borrado o se ha copiado mal. Cree uno nuevo en tempestwx.com y péguelo de
  nuevo.
- **Ninguna estación en Descubrimiento**: pulse **Listar mis estaciones**.
  Una estación sin Tempest (solo AIR y SKY) no se puede añadir.
- **Los valores dejan de actualizarse**: compruebe que Gladys tiene acceso a
  Internet y consulte los registros de la integración (una línea cuando
  empieza un problema, otra cuando termina; `LOG_LEVEL=debug` muestra cada
  mensaje).
- **El viento instantáneo varía demasiado**: desactive **Viento instantáneo
  cada 3 segundos**; la función sigue entonces la media por minuto.

## Límites

- Desarrollada sin el hardware: la integración todavía no se ha probado con
  una estación real.
- Solo nube: sin datos locales (UDP), inaccesibles desde el contenedor de la
  integración.
- Solo estaciones Tempest (`ST`): sin AIR ni SKY.
- Los nombres de las funciones se fijan al añadir la estación: cambiar el
  idioma después solo afecta a las estaciones añadidas más tarde.
- Los filtros de escena solo comparan igualdades: el disparador de rayos
  ofrece distancias fijas.
- La previsión es la de Tempest, para la ubicación de la estación.
