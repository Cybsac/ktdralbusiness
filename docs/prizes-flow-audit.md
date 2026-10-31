# Auditoría de /admin/prizes — 30/10/2026

## Alcance y límites

Revisión del flujo de configuración, generación, ZIP/QR, acceso público, ruleta,
raspa y gana, reintento, resultado sin premio, restauración y entrega. Se revisaron
las rutas alternativas para distinguir consumidores actuales de código candidato
a retirada. No se modificó código de aplicación, configuración ni base de datos.
No se generaron ni escanearon QR reales, porque revelar también escribe estado.

Se ejecutaron únicamente las 68 pruebas de `tests/prize-authorization`, con
persistencia simulada. Aprobaron. Esto verifica partes de autorización y entrega;
no equivale a un E2E de generación/juego. Los hallazgos restantes provienen del
análisis del código, no de incidencias demostradas en producción.

## Flujo actual que hay que preservar

1. `admin/prizes/page.tsx` consulta Prize, indicadores y lotes de ruleta
   (`isReusable:false`, `actionType:null`). PrizesClient y PrizeManager administran
   premios; InlineAutoBatchPanel solicita generación.
2. `/api/batch/generate-all` admite días, fecha, ventana horaria y un contrato de
   cantidades planificadas. El motor genera tokens con premio preasignado,
   firma y vencimiento. RETRY y LOSE son resultados del sistema.
3. RETRY se empareja con otro token funcional; LOSE no tiene premio físico.
   Los códigos se exportan en ZIP, CSV y manifiesto con enlaces `/r/{id}`.
4. `/r/{id}` redirige a `/marketing/ruleta?tokenId=...`.
   `/api/tokens/{id}/roulette-data` carga token y segmentos.
5. RouletteClientPage elige ruleta o ScratchCardExperience por experienceType.
   Ambas revelan mediante `/api/token/{id}/reveal`. La animación muestra el premio
   ya asignado: no realiza un sorteo nuevo ponderado al pulsar o raspar.
6. RETRY devuelve nextTokenId y espera mediante wait-ready; después cambia al QR
   funcional. Actualmente ese segundo juego requiere interacción manual.
7. La entrega usa `/api/token/{id}/deliver` y la autorización compartida:
   sesión de operador o OTP personal en público. La entrega registra responsable,
   marca deliveredAt/redeemedAt y condiciona la escritura para evitar duplicidad.

## Hallazgos prioritarios

### 1. La revelación acepta cambiar el premio desde el cliente — alta

`api/token/[tokenId]/reveal/route.ts:19,44,47` acepta body.prizeId y lo persiste
como assignedPrizeId sin comprobar que sea el premio del token ni una opción
permitida. La interfaz normal no envía ese campo, pero el contrato público lo
acepta. Debe decidir el servidor; no corresponde dejarlo al navegador.

### 2. Revelación sin transición atómica completa — alta

La misma ruta lee revealedAt y después ejecuta update por id, sin una condición
atómica de estado. No rechaza redeemedAt/deliveredAt antes de escribir y además
los limpia. Un token consumido por el endpoint de redención directa, sin
revealedAt, puede llegar a esa escritura. Peticiones concurrentes también pueden
superar la lectura inicial. Unificar estados y exigir una transición condicional;
no limpiar evidencia de entrega/canje durante una revelación.

### 3. Generación susceptible a lotes parciales — alta

`lib/batch/generateBatchCore.ts:193,236,342` crea lote, consume stock y luego
inserta tokens por bloques sin una transacción global ni una compensación.
generateBatchPlanned también crea e inserta en pasos separados. Un fallo de
emparejamiento o inserción puede dejar stock consumido, contadores incrementados
o un lote parcial. Un fallo de ZIP ocurre después de persistir el lote: reintentar
la petición no equivale a descargar lo ya creado. Hace falta una operación
recuperable e idempotente; para volúmenes altos no basta con envolver un ZIP largo
en una transacción de base de datos.

### 4. Vigencia calculada de formas distintas — alta

`api/batch/generate-all/route.ts:165` construye la hora con Date.setHours en la
zona del servidor después de partir de Lima. El horario puede variar entre
entornos. validFrom se añade después, mediante SQL con errores capturados sin
fallar el lote. `roulette-data:192` deriva availableFrom de functionalDate o,
si falta, del vencimiento. `reveal` no verifica validFrom/startTime y permite
saltarse disabled si encuentra un retry revelado. El habilitador programado
habilita todos los disabled del día, sin distinguir programación de desactivación
manual. Separar causas de bloqueo y compartir una sola política temporal.

### 5. Un solo tipo de premio impide jugar — media/alta

`roulette-data:160` exige al menos dos premios disponibles para cualquier
experienceType. Puede rechazar un raspa y gana válido y un lote que al agotarse
otros resultados conserve un único premio. El resultado ya está preasignado;
la disponibilidad del QR no debería depender de cuántos segmentos decorativos
quedan. Definir segmentos por experiencia sin inventar resultados entregables.

### 6. Reintento con reserva y recuperación débiles — alta

La reserva se infiere de otro token que apunta a pairedNextTokenId. El motor
vincula IDs pero no marca una reserva exclusiva independiente. El endpoint de
datos bloquea algunos accesos directos, mientras reveal no aplica esa misma regla
cuando el token está enabled. El fallback elige el primer token libre por id,
sin excluir claramente reservas de otros reintentos ni reclamarlo de forma
exclusiva. Puede competir por una misma continuación.

Además, al recargar un RETRY revelado, el serializador no devuelve su continuación
como estado recuperable y el cliente reconstruye un panel de premio original.
La continuidad depende de nextTokenId en memoria. wait-ready consulta cada
100 ms durante hasta 10 s; omite varias condiciones usadas en otras rutas.
Resolver el siguiente estado en servidor y devolverlo también al recargar.

### 7. Permisos administrativos distintos entre página y API — media/alta

`middleware.ts:211` limita páginas administrativas por rol/área. Sin embargo,
`/api/prizes` y `/api/batch` están en protectedAPIs, cuyo control final exige
sesión, sin aplicar los mismos permisos de gestión. Las rutas genéricas de
premios/generación no añaden esa validación. La autorización para gestionar
premios debe ser explícita e independiente del permiso para entregar con sesión
u OTP. No cambiar el bypass de OTP de operadores al corregir esto.

## Consistencia, mantenimiento y rendimiento

8. **Stock ilimitado contradictorio.** PrizeManager muestra vacío/NULL como
   ilimitado y pendiente, pero generación automática selecciona sólo stock
   numérico positivo. Hace falta una cantidad de emisión explícita para ese caso
   o una etiqueta que explique que no participa de “emitir todo”.
9. **Indicador de expiración incorrecto.** La página inicial envía expired y valid
   como cero. PrizeManager intenta una variable global `window.__ALL_TOKENS__`
   sin productor encontrado en src y termina mostrando un fallback afirmativo.
   Calcular los indicadores en servidor por lote/estado, no inferir vencimiento
   de stock o active.
10. **Separación de tipos incompleta.** Los chips ya excluyen lotes estáticos y
    reutilizables; el catálogo Prize sigue compartido con estáticos. El cliente
    oculta algunos premios por texto de key (`includes('reusable')`) o tokens
    asociados, mientras generar-todo consulta todos los activos con stock. No
    inferir propiedad del premio desde su nombre: definir participación en cada
    generador y mantener compatibilidad con los existentes.
11. **Firmas y constantes duplicadas.** El motor firma con TOKEN_SECRET o
    `dev_secret` y el número CURRENT_SIGNATURE_VERSION; la validación usa
    SECRET_MAP por versión. Una rotación con sólo TOKEN_SECRET_Vn puede producir
    firmas no verificables. Unificar la obtención del secreto sin invalidar QR
    anteriores. Días permitidos, zona/cierre, límites de segmentos, tiempos de
    reintento y límites de generación están repartidos; algunos son decisiones
    válidas que deben centralizarse, no eliminarse indiscriminadamente.
12. **Carga y componentes.** roulette-data trae todos los tokens válidos del lote
    con premios sólo para agrupar segmentos; preferir agregados y consultas
    específicas. PrizesClient declara componentes con estado dentro del render,
    con riesgo de remonte al refrescar premios. Cliente de juego mezcla carga,
    animación, audio, reintento, resultado y entrega; conservar componentes
    visuales operativos y extraer controladores/contratos en vez de reescribirlos.
    El texto admin “auto-gira” contradice el segundo giro manual actual.

## Código candidato a retirada, sujeto a confirmar consumidores

No se encontraron importaciones de AutoBatchModalTrigger, InlineStaticBatchPanel,
TokenPlayRedeem ni RouletteSegments.new en src fuera de sus propias definiciones
y del subárbol antiguo. `/r/[tokenId]/page.tsx` usa redirección, no el antiguo
TokenPlayRedeem. No confundir `/api/roulette/{id}` (sesiones de ruleta por lote,
con consumidores administrativos) con el reveal público por token: requiere
clasificar usos antes de unificar o retirar. El endpoint manual de batch devuelve
410 expresamente; mantener ese contrato mientras existan consumidores externos.

## Plan propuesto, sin reescritura general

1. **Congelar comportamiento y cubrir escenarios.** Matriz con premio/RETRY/LOSE
   en ruleta y raspa, recarga antes/después de revelar, copia de enlace, expiración,
   programación, desactivación, último premio, concurrencia, entrega con sesión y
   OTP. Repositorios simulados y PostgreSQL efímero aislado para transacciones.
   Los tests antiguos usan setupTestDb/TRUNCATE y algunos SQL SQLite obsoletos;
   no ejecutarlos contra la base conectada ni activar sus overrides.
2. **Corregir integridad detrás de las rutas actuales.** Resultado fijado en
   servidor, transición de reveal atómica, no reabrir consumidos, reservas RETRY
   exclusivas, continuación restaurable y disponibilidad única. Primero pruebas
   que documenten los fallos; luego correcciones pequeñas con los mismos enlaces,
   QR y contratos compatibles. Mantener OTP y trazabilidad actuales.
3. **Generación y configuración.** Servicio de emisión recuperable, stock y
   contadores consistentes, claves de idempotencia y exportación repetible del
   mismo lote. Tiempo en zona configurada, fechas explícitas, firma versionada,
   contratos compartidos y permisos de gestión. Separar emisión de exportación.
4. **Componentes, métricas y limpieza.** Extraer SystemPrizeControls,
   PrizeStockEditor, PrizeCatalog, BatchGenerator y BatchStats; controlador común
   de experiencia con presentadores de ruleta/raspa. Tipos explícitos y errores
   consistentes. Retirar sólo código sin consumidores y pruebas obsoletas ya
   reemplazadas. Validar móvil y restauración en un entorno aislado.

Antes de cambiar políticas hay que fijar qué significa desactivar un premio para
QR ya impresos, si apagar el juego también debe impedir entregar premios ya
revelados, y cómo se desea presentar un RETRY cuando no queda continuación.
No asumir esas decisiones durante una limpieza técnica.
