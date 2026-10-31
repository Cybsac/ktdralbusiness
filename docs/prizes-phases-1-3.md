# Premios: entrega de fases 1, 2 y 3

Fecha: 30/10/2026. Continúa [el plan por fases](prizes-refactor-plan.md).

## Alcance implementado

### Fase 1: contratos y pruebas aisladas

- Inventario de consumidores: el QR individual usa /r/{id} → marketing/ruleta;
  generación de /admin/prizes usa generate-all; las sesiones de ruleta por lote
  se crean desde admin/batches y admin/roulettebatches y tienen un algoritmo propio.
  No se eliminaron esas sesiones ni sus resultados virtuales.
- `src/lib/prize-games/contracts.ts` define acciones, errores y continuación.
  Se conservan los endpoints singulares y sus alias plurales de reveal/deliver.
- `npm run test:prize-games` usa una configuración con suites seleccionadas y
  persistencia simulada. Las importaciones de prisma y del helper antiguo de
  pruebas se redirigen a una barrera sin conexión; una dependencia no simulada
  falla, no abre la base de negocio.
- Se reemplazó la prueba antigua de creación de premios por llamadas al handler
  real con almacenamiento simulado. Se retiraron las tres pruebas de redención
  que sembraban datos en la base indicada por DATABASE_URL; sus escenarios
  válido, expirado y sistema apagado están cubiertos con fixtures.
- Las suites antiguas de generación/sesiones que requieren setupTestDb no se
  ejecutan con este comando. Su sustitución/retirada restante forma parte del
  alcance de generación y limpieza final. No usar el comando global de tests para
  asumir aislamiento de esas suites.

### Fase 2: integridad y permisos

- `reveal.ts` resuelve el premio desde el token. Un prizeId diferente enviado por
  el cliente produce INVALID_PRIZE antes de escribir. El mismo ID se tolera para
  compatibilidad; no concede capacidad de reasignación.
- Reveal exige una transición condicional: no revelado, no canjeado, no entregado,
  habilitado y vigente. No limpia deliveredAt, redeemedAt ni evidencia anterior.
- Repetir un reveal completado devuelve su resultado/fecha original sin registrar
  otro evento. Un token ya canjeado/entregado no puede reabrirse por esa ruta.
- Las operaciones de juego usan transacciones Serializable y reintentos acotados
  de conflictos. La exclusión de reservas se evalúa dentro de la misma transacción
  que persiste el emparejamiento/revelación; no es una simple condición de pantalla.
  No se añadió un índice único ni se modificaron reservas históricas en bloque.
- Disponibilidad compartida: expiración, bloqueo, validFrom/startTime/endTime y
  fecha funcional. Ya no se usa expiresAt como fecha de inicio si falta el lote.
- Deliver mantiene el control de sesión/OTP, responsable y escritura condicional;
  rechaza resultados RETRY/LOSE como entregas físicas. Mantiene la política previa
  de permitir entregar un premio ya revelado aunque se pause la emisión de su
  definición Prize. Bloquear el Token sí impide entregarlo.
- La redención directa conserva firma y control OTP/sesión; ahora aplica reserva
  y condiciones de disponibilidad compartidas y no puede ser reabierta por reveal.
- Los permisos de gestión son independientes de los de entrega: ADMIN/COORDINATOR
  o áreas funcionales Animación/Multimedia para escrituras de premios y generación.
  También se exige gestión para crear/cancelar una sesión administrativa. No se
  amplían las rutas permitidas por el middleware para esos perfiles.
- La ruleta por sesión delega la toma/revelación del token en el mismo servicio de
  integridad. No registra un ganador ficticio cuando la toma falla. Conserva sus
  modos BY_PRIZE/BY_TOKEN y slots virtuales. En BY_TOKEN, selección y consulta de
  restantes usan IDs consumidos; no eliminan simplemente los primeros N elementos.

### Fase 3: reintento y presentación

- La selección de continuación prefiere el par válido existente. El fallback sólo
  toma un token funcional libre, vigente y del mismo lote; no roba otra reserva.
- No se habilita un token disabled para hacer funcionar RETRY. Si no hay una
  continuación válida, el nuevo reveal falla sin consumir el reintento.
- Una continuación ya asignada a un RETRY revelado no se cambia silenciosamente.
  Los datos de recuperación indican READY, REVEALED, DELIVERED o UNAVAILABLE.
- Recargar el enlace original permite continuar al QR funcional o consultar su
  estado. Una reserva histórica ambigua/malformada se bloquea y solicita revisión;
  no se eliminan asociaciones ni se adjudica otro premio automáticamente.
- `RetryContinuation` presenta el paso explícito Continuar. Se retiraron el
  componente RetryOverlay, su bucle de espera, estado duplicado y una segunda
  presentación de overlay que ya no era alcanzable.
- wait-ready queda como adaptador de lectura inmediata, con las comprobaciones
  compartidas y sin bucle de consultas cada 100 ms. La UI actual no lo necesita.
- Raspa admite un único resultado. La ruleta con un único tipo muestra dos
  segmentos del mismo premio; el segmento repetido está marcado presentationOnly
  y no añade inventario ni un resultado ganador nuevo.
- LOSE se restaura como resultado sin premio; no como un panel entregable.
- Se retiró splitLabelBackendV2, sin consumidores, del endpoint reemplazado.
  Los demás candidatos del informe se revisarán en la fase de limpieza final.

## Contratos de respuesta

- Reveal mantiene phase, tokenId, prizeId y timestamps; añade alreadyRevealed,
  action PRIZE/RETRY/LOSE, nextTokenId y continuation. Sólo la primera revelación
  escribe y genera evento.
- roulette-data mantiene token y elements. El token incluye availability, action
  y continuation para restauración; los timestamps son ISO. No expone firmas ni
  toda la colección de tokens del lote.
- Conflictos: INVALID_PRIZE, STATE_CHANGED, RESERVED_BY_RETRY,
  RESERVATION_CONFLICT, RETRY_UNAVAILABLE, GAME_BUSY. Un rechazo no debe crear
  una entrega ni un spin confirmado.
- Los contadores de segmentos son presentación del juego, no un nuevo contrato
  de stock disponible para emisión.

## Matriz verificada

| Escenario                                       | Verificación                                             |
| ----------------------------------------------- | -------------------------------------------------------- |
| Premio/RETRY/LOSE en ruleta y raspa             | Servicios con fixtures y persistencia simulada           |
| Resultado manipulado desde el cliente           | Servicio y handler HTTP, sin escritura                   |
| Token consumido por redención directa → reveal  | Rechazado; evidencia conservada                          |
| Reveal repetido o concurrente                   | Misma fecha, una transición; simulación serializada      |
| Vencimiento, inicio futuro, fin pasado, bloqueo | Rechazo antes de escritura                               |
| QR funcional antes de su RETRY                  | Reserva bloquea consulta/juego                           |
| Dos RETRY buscando la última continuación       | Una asignación en la simulación; la otra queda pendiente |
| Recarga del RETRY, funcional revelado/entregado | Estado persistido recuperable                            |
| Padre sin continuación o reserva ambigua        | Rechazo seguro, sin reparación destructiva               |
| Último tipo de premio                           | Raspa de un resultado; ruleta sin premios ficticios      |
| Entrega pública sin OTP                         | Gate rechaza antes de mutación                           |
| Entrega autorizada                              | Responsable, timestamps y espejo redeemedAt conservados  |
| Sesiones BY_TOKEN, BY_PRIZE y slots virtuales   | Handlers sobre repositorios simulados                    |
| Creación de premios y colisión de key           | Handler real, almacenamiento simulado                    |
| Firmas v1/v2                                    | Comprobación pura sin base de datos                      |
| Emisión actual de las dos experiencias          | Caracterización con stock/persistencia simulados         |

La suite segura tiene 160 pruebas aprobadas. Tipos y lint del alcance modificados
se verifican aparte. Las pruebas de concurrencia de servicios simulan transacciones
serializadas y comprueban el nivel solicitado a Prisma; no equivalen a una prueba
de carga con múltiples conexiones PostgreSQL reales.

La comprobación visual usó RouletteClientPage y NewRoulette reales en una vista
local aislada con respuestas ficticias: recuperar RETRY → Continuar → jugar con
un único premio → mostrar el premio y su acción pública de entrega. Se comprobó
ancho de 320 px sin overflow horizontal. No se efectuó la entrega desde navegador.

## Datos y trabajo restante

No se ejecutaron migraciones, semillas, resets, generaciones, revelaciones ni
entregas de prueba contra la base conectada. Los IDs y firmas existentes no se
reescribieron. La exclusividad nueva protege las operaciones que pasan por estos
servicios; no repara automáticamente datos históricos ni escrituras externas.

Continúan pendientes las fases 4–6: emisión recuperable/idempotente, atomicidad de
stock/contadores, exportación repetible, fechas y secretos de generación,
distinción persistida entre programación y bloqueo manual para el habilitador,
componentes administrativos, métricas definitivas y retirada restante de tests y
código antiguo. La generación actual sólo recibió control de gestión y una
respuesta explícita si falla su validación; sus garantías transaccionales no se
declaran corregidas en esta entrega.

## Actualización posterior

Las fases siguientes están implementadas. Ver [fases 4–6](prizes-phases-4-6.md)
para generación, stock, calendario, componentes, retirada y límites de validación.
