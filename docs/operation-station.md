# Estación de operación

El administrador abre `/admin/estacion` o el colaborador `/u/estacion` en la PC. La estación genera una invitación temporal de un solo uso; el colaborador autenticado la escanea en `/u/scanner` y pasa a `/u/estacion/terminal`.

## Canje desde el móvil

El teléfono vinculado reutiliza `StaffScannerPage`, el mismo componente del escáner habitual. Registra cada lectura en la estación y continúa el flujo normal del QR en el teléfono: ofertas, cumpleaños, invitaciones, QR estáticos, reutilizables, Tokenshow y Mundial. La lectura no marca automáticamente ningún premio como entregado. El colaborador completa el canje en su pantalla habitual; sus endpoints mantienen vigencia, disponibilidad, autorización por sesión y atribución del responsable.

La estación muestra las últimas 100 lecturas recibidas, de más reciente a más antigua. No requiere confirmar recepción y no ofrece una acción de entrega. El registro de lectura no acredita que se haya completado el canje. Se retiró la acción `confirm` de la API. El campo histórico `confirmedAt` se conserva únicamente para preservar los datos anteriores; no se usa en el flujo nuevo. Los registros antiguos cuyo contenido ya fue borrado no se presentan como nuevas lecturas.

## Vinculación y conexión

La invitación se guarda como hash y caduca. El vínculo está ligado al usuario, terminal y estación, y vence según el día de trabajo configurado. Ambos dispositivos requieren sesión válida y pueden conectarse a redes diferentes mediante internet. La cámara necesita HTTPS y permiso del navegador. El teléfono recuerda el vínculo; la estación y el colaborador pueden revocarlo.

## Envío y recuperación

Cada lectura tiene un identificador estable. Antes de abrir el flujo de canje se registra mediante la API; si falla la conexión, la lectura queda pendiente en memoria y, cuando está disponible, en sessionStorage. Se vuelve a escanear el mismo QR para reintentar con el mismo identificador, evitando duplicar el registro. No se admite otro QR hasta enviar o descartar la lectura pendiente. Cerrar la sesión del navegador puede perder una lectura aún no enviada. La recuperación no ejecuta entregas automáticamente.

## Comunicación y despliegue

La API y la base de datos son la fuente de verdad. Socket.IO notifica cambios y la estación consulta periódicamente como respaldo. La página del móvil actualiza su conexión mientras permanece abierta; navegar al canje o poner el navegador en segundo plano puede hacer que la estación lo muestre desconectado sin revocar su vínculo.

Se conservan las migraciones `20261031120000_operation_station` y `20261031130000_station_readings`. Este ajuste no necesita cambios de esquema ni borra datos existentes. Los contenidos de las lecturas se conservan como registro; debe definirse una política de retención antes de utilizar datos sensibles.

El antirrebote del escáner consulta el instante actual en cada lectura, sin dejar una pausa memorizada que bloquee los escaneos siguientes.
