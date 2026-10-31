# Premios y juegos: fases 4–6

Actualización del catálogo: [preparación independiente por jornada](prizes-catalog.md).
La generación ahora usa exclusivamente ese stock diario, sin cargar ni consumir
cantidades del catálogo global. El historial se conserva.

Actualización 31/10/2026: la gestión actual no muestra estadísticas y emite exclusivamente el stock preparado. Ver [gestión actual](prizes-catalog.md).

Implementación: 30/10/2026. Complementa [fases 1–3](prizes-phases-1-3.md).

## Emisión y recuperación

`issueGameBatch` es el único generador de lotes de ruleta/raspa. La API y el CLI
delegan en él. Valida la solicitud, disponibilidad, cantidades, límites y
emparejamiento RETRY antes de confirmar una transacción Serializable. Stock,
contadores, lote, tokens y evidencia de emisión se confirman o revierten juntos.
Los conflictos de serialización tienen reintentos acotados. No se dibujan QR ni
se transmite el ZIP dentro de la transacción.

La administración envía `Idempotency-Key` y `Accept: application/json` a
`POST /api/batch/generate-all`. La respuesta contiene `batchId`, `operationKey`,
`totalTokens`, `reused` y `downloadUrl`. Repetir la misma clave y solicitud devuelve
el mismo lote; cambiar el contenido produce `OPERATION_CONFLICT`. La intención
pendiente se conserva en la pestaña antes de enviar. Después de un fallo ambiguo
o de recargar, **recuperar la emisión pendiente**, sin iniciar otra intención.
Errores definitivos de validación/stock permiten corregir el formulario.

`GameIssuance` conserva solicitud normalizada, fechas, versión y metadatos de
premios. Su evidencia no se puede reemplazar. Si un lote se purga por los
mecanismos existentes, la referencia queda nula y repetir esa operación devuelve
410; no reconstruye ni duplica premios retirados.

Los clientes antiguos sin cabecera conservan respuesta ZIP y reciben la clave en
`X-Emission-Key`; para recuperación fiable deben proporcionar su propia clave y
conservarla antes de enviar. El CLI exige `--key` y usa los mismos servicios:

```
npx tsx scripts/generateBatch.ts --auto --days 7 --key IDENTIFICADOR_UNICO --desc "Campaña"
```

Repetir clave y opciones recupera el lote y sus archivos. El CLI requiere URL
pública configurada; no inventa un dominio de QR. No se ejecutó ninguna emisión
del CLI contra datos de negocio durante esta entrega.

## Stock, calendario y firmas

- La emisión completa consume stock **finito positivo de la preparación diaria**
  de premios activos, `gameEnabled=true` y no reutilizables. El stock ilimitado requiere cantidad
  explícita. Las cantidades elegidas también descuentan stock finito; se informa
  junto al formulario. No cambia el modelo de premio preasignado.
- `gameEnabled` y `staticEnabled` expresan participación, sin deducirla del nombre
  de una clave o de lotes históricos. Las filas anteriores conservan ambos usos
  habilitados para compatibilidad de otros módulos; esto no los incorpora al catálogo diario.
  Los premios nuevos de Tokenshow se registran exclusivamente en su jornada.
  El generador estático vuelve a leer elegibilidad dentro de su transacción.
- Calendario central en `calendar.ts`: `TOKENS_TIMEZONE` (por defecto Lima), corte
  de jornada existente y `TOKENS_CALENDAR_CLOSE_HOUR` (por defecto 03:00). Se
  conserva la política de cierre anterior. Fechas, inicio y fin se persisten
  explícitamente; no se extraen del nombre del lote. La UI informa zona y cierres.
- Un token futuro nuevo se crea con `disabled=false` y fechas de inicio futuras.
  Servidor y pantalla comprueban su vigencia. `disabled` conserva el bloqueo
  individual. Ni el endpoint programado ni el heartbeat del scheduler lo limpian.
- Se mantiene la política global de apertura/cierre del juego existente; no se
  confunde con la vigencia de cada QR. Se corrige el seguimiento de los cinco
  trabajos del scheduler para que puedan detenerse todos.
- La firma activa requiere su secreto por versión. Se descubren las versiones
  configuradas sin el antiguo máximo de ocho. `TOKEN_SECRET` corresponde a V1;
  una rotación requiere la variable de la versión nueva. No se vuelven a firmar
  QR anteriores. Se retiran tipos Luxon locales obsoletos usando los oficiales.

Límites de emisión en `issuance-policy.ts`; las variables `BATCH_MAX_TOKENS_AUTO`,
`BATCH_CREATE_CHUNK` y `BATCH_TRANSACTION_TIMEOUT_MS` se validan. El tamaño máximo
por defecto es 10.000 y el techo configurable 50.000. Una emisión demasiado
grande para el tiempo disponible revierte completa; no hay trabajo parcial oculto.

## Descarga y componentes

`batch-export.ts` reconstruye ZIP/CSV/manifiesto a partir de IDs y firmas ya
guardados. En emisiones nuevas usa la descripción original de los premios aunque
se renombren después. CSV incluye versión de firma y enlace de continuación.
Los campos de estado reflejan la consulta actual; no se promete un archivo
idéntico después de entregar/deshabilitar un token. Los lotes históricos tienen
lectura compatible sin snapshot. Los estáticos siempre incluyen QR.

Un fallo o cancelación de descarga detiene la exportación y no vuelve a emitir.
La descarga puede repetirse desde el recibo o el historial.

Administración separada en `PrizeForm`, `PrizeStockEditor`, `SystemPrizeControls`,
`PrizeCatalog`, `BatchGenerator`, `BatchStats` y `useBatchIssuance`. El controlador
HTTP público comparte carga, revelación y entrega; la presentación real de ruleta,
raspa, audio y confirmación personal se conserva. Las cargas se cancelan al salir
y sólo se reintentan fallos transitorios, no rechazos definitivos. Se retira el
anuncio fijo de apertura a las 18:00 en la pantalla de error.

Las métricas agregadas son estados excluyentes: disponible, reservado, programado,
revelado pendiente, entregado, expirado, deshabilitado y resultado sin entrega.
Una entrega reflejada también en `redeemedAt` cuenta una vez. RETRY/LOSE revelados
no cuentan como entregas físicas pendientes. Las reservas ambiguas quedan
reservadas, no disponibles. Se excluyen lotes estáticos y reutilizables. Se retira
la variable global `__ALL_TOKENS__`, los ceros de relleno y la carga global de tokens
del panel de premios.

## Retirada y compatibilidad

Se eliminan el generador anterior, su caché sin consumidores, componentes de
administración reemplazados, las vistas públicas sin importadores detrás de `/r`,
el archivo duplicado `RouletteSegments.new`, pruebas antiguas de generación y
sesiones que borraban tablas, archivos vacíos/skiptest y scripts de backfill que
confundían reserva con deshabilitación. El antiguo CLI ahora delega en el servicio
único y se retira el script ad hoc con host/puerto y nombre de lote fijos.

Adaptadores conservados:

| URL                                             | Motivo                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/r/[id]`                                       | QR impresos; conserva la redirección a la experiencia pública.                            |
| `/api/batch/generate-all` con ZIP               | Clientes/operadores anteriores; misma emisión, salida compatible.                         |
| `/api/batch/generate`                           | 410 explícito para clientes del generador manual retirado.                                |
| `/api/admin/prizes/ensure-system`               | Alias de clientes anteriores; delega en `/api/prizes/ensure-system` con el mismo permiso. |
| `/api/tokens/[id]/wait-ready`                   | Consulta inmediata compatible para clientes de la continuidad anterior.                   |
| `/api/system/tokens/enable-scheduled`           | Scripts y cron existentes reciben confirmación sin quitar bloqueos individuales.          |
| `/api/admin/tokens/backfill-retry-reservations` | 410 explícito: el backfill anterior ya no puede deshabilitar continuaciones.              |

Retirar aliases sólo cuando los consumidores externos dejen de usarlos. Mantener
los enlaces de QR impresos mientras existan esas campañas.

## Validación y datos

185 pruebas en 27 archivos con `npm run test:prize-games`: repositorios simulados y PostgreSQL PGlite
**en memoria**, sin URL de conexión. El alias de persistencia impide acceder a la
base de negocio si un test olvida simularla. Cubren rollback entre inserciones,
reintentos, misma clave, conflicto de contenido, firma, stock ilimitado/finito,
límites, migración, todas las métricas y el recorrido generación → ZIP/QR real
decodificado → consulta → revelación → continuidad → entrega → nueva consulta.
Las suites de autorización cubren sesión, OTP personal y rechazos.

La concurrencia de solicitudes se comprueba con transacciones serializadas en la
conexión única de PGlite y conflictos Prisma simulados. **No equivale a una prueba
de carga contra PostgreSQL con varias conexiones**. No se ejecutó el E2E general,
el conjunto global antiguo ni emisiones/canjes de prueba en la base conectada.

Revisión visual con componentes reales y API ficticia aislada: 320×568 y
1280×800; creación/edición, recuperación tras recargar, ruleta, raspado, OTP
incorrecto/correcto y reapertura de una entrega. A 320 px el ancho del documento
permanece en 320 px. Evidencia: `prizes-recovery-mobile.png` y
`prizes-delivery-mobile.png` en la carpeta de visualizaciones de esta sesión.

Migración `20261030190000_game_batch_issuance` probada en memoria y desplegada con
copia privada previa de Prize/Batch/Token. Comparación inmediatamente posterior:
220 premios, 49 lotes y 1.317 tokens, **todos los campos anteriores sin cambios**.
La copia permanece en el directorio temporal privado del equipo. No se aplicaron
reset, seed, borrados ni backfills de estado.

**Revisión operativa necesaria:** se detectaron 30 tokens históricos futuros con
`disabled=true`. El esquema anterior no registra si era programación o bloqueo
manual. Se conservan bloqueados; deben revisarse por lote antes de habilitarlos
mediante una operación administrativa real. No se inferirá ni limpiará ese estado
automáticamente. Los lotes nuevos no presentan esa ambigüedad.

El servidor local queda en el puerto 3000. La carga real del servicio de métricas
se verificó mediante lectura; el navegador sin sesión redirige al acceso. Tipos y
lint del alcance se comprueban separadamente; no se declara build global ni E2E de
producción. Para revertir código, conservar columnas/evidencia nuevas: no es
necesario eliminar datos ni volver a firmar tokens.
