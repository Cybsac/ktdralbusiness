# Invitaciones especiales: flujo y mantenimiento

Actualizado: 31 de octubre de 2026.

## Alcance y compatibilidad

El acceso administrativo sigue en `/admin/generadorinvitaciones` y la invitación pública en `/i/[code]`. Se conservan componentes, disposición y estilos de la interfaz. Los estados y las validaciones actualizan la disponibilidad de los controles existentes.

`src/lib/invitations/service.ts` conserva las exportaciones utilizadas por las rutas y delega en módulos de eventos, invitados, consultas, códigos e ingresos. Validaciones, calendario, autorización, firma y recursos tienen responsabilidades separadas. No existe un cliente Prisma adicional en este módulo.

Los eventos y las invitaciones históricas se conservan. La tabla histórica `SpecialInvitationCard` permanece por compatibilidad de datos; el flujo operativo no la consulta ni genera registros allí. No se ejecutan migraciones destructivas para retirar ese historial.

## Eventos, invitados y códigos

Los formularios y las rutas comparten validaciones de fecha real, hora, nombre y campos opcionales. Las fechas se interpretan con una zona configurable, sin offsets manuales. Los permisos verifican la cuenta activa; ADMIN, COORDINATOR y STAFF administran, y COLLAB conserva lectura y registro de ingresos.

La creación registra el identificador del usuario. Las operaciones bloquean primero el evento. Los invitados editados o eliminados deben pertenecer a ese evento. Los duplicados se comprueban bajo bloqueo y las cargas masivas son transaccionales: no dejan filas parciales. El aforo se verifica al agregar invitados y registrar ingresos. No se elimina una invitación que tenga una llegada registrada.

Generar códigos conserva códigos y estados existentes, incluso ante una solicitud histórica con `force`. No genera para eventos cerrados o vencidos ni para invitados cancelados o utilizados. La asignación utiliza aleatoriedad criptográfica y una exclusión compartida entre emisores; comprueba colisiones por lote y persiste las firmas en una sola operación SQL.

Cambiar la fecha recalcula vencimientos y firmas manteniendo códigos. Se bloquea la reprogramación después de registrar ingresos. El ingreso comprueba estado del evento y la invitación, fecha, vencimiento, firma, correspondencia de identificadores y aforo. El registro es condicional y transaccional para evitar dos llegadas simultáneas. La firma utiliza secretos configurados y versiones; no hay un secreto alternativo fijo propio de invitaciones.

## Plantillas con ciclo de vida

Las plantillas se suben exclusivamente a `invitation-templates`. `InvitationTemplateAsset` registra cada objeto antes de subirlo, incluyendo plazo de adopción y reintentos. Una subida abandonada o fallida puede limpiarse sin perder su referencia durable. El bucket se configura fuera de las solicitudes: la subida no lista ni crea buckets.

Al vincular una plantilla se valida su origen y se bloquea su registro. Reemplazarla, quitarla, cancelar o completar un evento anticipa su revisión. La tarea programada borra plantillas sin uso vigente y limpia las referencias de eventos; conserva las compartidas con otro evento activo no vencido.

Antes de borrar remotamente, se confirma en una transacción que no hay referencias vigentes y se marca el objeto para eliminación. Esa marca impide que otro evento adopte el archivo durante el borrado. Los errores permanecen para reintento y un reinicio no pierde los trabajos.

`maintenance.ts` inicia una tarea por proceso de producción desde la instrumentación de Next, al iniciar y según la frecuencia configurada. No depende de visitas al administrador ni del programador global de tokens. No se inicia durante compilaciones ni en desarrollo.

Solo se aceptan URLs públicas del bucket y origen de Supabase configurados. La descarga impide redirecciones, limita bytes, tiempo y píxeles, y devuelve un error ante una plantilla ilegible en lugar de sustituirla silenciosamente.

## Tarjetas y descargas temporales

Las tarjetas finales no se suben a Supabase. Cada descarga prepara plantilla y fuentes una sola vez. El PNG individual se devuelve directamente. El ZIP se compone con una imagen en preparación cada vez en un directorio temporal del sistema; no se acumula el ZIP completo en memoria.

El archivo temporal se elimina al cerrar la descarga, cancelarla o fallar la generación. Si falla una tarjeta, no se entrega un ZIP incompleto como éxito. Las respuestas no se almacenan en caché. Las previsualizaciones locales liberan sus URLs; el listado cancela solicitudes superadas y el detalle obtiene invitados en una sola consulta HTTP.

## Configuración

Los valores predeterminados están en `policy.ts` y las posiciones del diseño en `templates.ts`. Las coordenadas visuales se conservan.

- `NEXT_PUBLIC_INVITATION_TIMEZONE`: America/Lima por defecto.
- `INVITATION_CLEANUP_CRON`: cada diez minutos por defecto.
- `INVITATION_CLEANUP_BATCH_SIZE`: 20 recursos por pasada por defecto.
- `INVITATION_UPLOAD_LEASE_MS`: plazo para adoptar una subida; quince minutos por defecto.
- `INVITATION_MAX_TEMPLATE_BYTES`: 10 MiB por defecto.
- `INVITATION_TEMPLATE_TIMEOUT_MS`: quince segundos por defecto.
- `INVITATION_TRANSACTION_TIMEOUT_MS`: treinta segundos para la emisión por defecto.
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: almacenamiento existente.
- `TOKEN_SECRET_Vn` o `TOKEN_SECRET_n`: secretos por versión. `TOKEN_SECRET` se admite para la versión 1.

## Limpieza inicial y validación

Con autorización explícita se eliminaron las once plantillas anteriores: 7.672.790 bytes. Se retiraron ocho referencias a imágenes borradas. La comparación de datos confirmó que se conservaron los nueve eventos y las 340 invitaciones, incluidos códigos y registros de llegada. No había tarjetas finales almacenadas en la tabla histórica.

La migración `20261101000000_invitation_template_lifecycle` agrega únicamente el registro de recursos. No borra ni recrea tablas de negocio.

La verificación incluye pruebas aisladas de ingreso, vigencia, firmas, reprogramación, duplicados, aforo, pertenencia al evento, conservación de códigos, limpieza compartida, reintentos, subidas abandonadas y exportaciones temporales. La operación SQL de firmas se verificó con PostgreSQL en memoria. No se ejecutaron canjes ni pruebas destructivas contra la base real. Los archivos de pruebas permanecen locales.
