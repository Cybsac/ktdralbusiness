# Estación de operación

El administrador puede abrir `/admin/estacion` desde «Estación de operación» en el panel. Desde el área de trabajo, el colaborador abre `/u/estacion` en la PC. Ambas rutas usan la misma estación y sesión de usuario. La estación genera un QR temporal y de un solo uso. Un colaborador con sesión activa lo lee desde `/u/scanner`; el teléfono pasa a `/u/estacion/terminal` y transmite las lecturas a la estación. Las lecturas no ejecutan canjes ni redirigen al cliente. El operador confirma la recepción en pantalla.

## Vinculación y conexión

La invitación solo se guarda como hash y caduca. El vínculo está ligado al usuario, al terminal y a la estación, que vence al finalizar el día de trabajo configurado. El celular recuerda el vínculo y la PC recuerda su estación en el mismo navegador; ambos requieren una sesión válida. El operador o el colaborador pueden desvincular el terminal. El estado del terminal se actualiza mientras su página permanezca activa; el navegador o el sistema pueden pausar la cámara y la aplicación en segundo plano.

## Lecturas pendientes

Cada lectura lleva un identificador único. La aplicación intenta enviarla al servidor y reintenta con el mismo identificador si no recibe respuesta; la estación recupera las lecturas pendientes de la base al recargarse. El celular mantiene una lectura pendiente en la sesión del navegador y deja de admitir otra hasta enviarla o descartarla. Si se cierra esa sesión del navegador, no se garantiza conservar la lectura que aún no llegó al servidor. Para evitar múltiples lecturas de un mismo QR inmóvil, el operador del celular debe pulsar «Permitir leer el mismo código otra vez» si necesita repetirlo.

Cuando el operador confirma una lectura, se borra el contenido del QR del registro y se conserva su identificador para evitar duplicados. Las lecturas sin confirmar quedan almacenadas en la base: por ahora no existe una tarea que elimine su contenido al finalizar la jornada; debe definirse una política de retención antes de utilizar datos sensibles. Se muestran como máximo las primeras 100 pendientes; al confirmar una se cargan las siguientes.

## Comunicación y despliegue

Las solicitudes y la base de datos son la fuente de verdad; Socket.IO informa de cambios cuando está disponible, y la estación consulta periódicamente como respaldo. Esto evita depender de que dos dispositivos estén conectados al mismo proceso para recuperar las lecturas. Debe verificarse la infraestructura real antes de escalarla, incluidos los tiempos de respuesta y la política de retención.

Antes de usar la función deben aplicarse, por el proceso habitual de despliegue, las migraciones aditivas `20261031120000_operation_station` y `20261031130000_station_readings`. No se aplican automáticamente al editar el proyecto. Una instalación existente también requiere generar el cliente Prisma y reiniciar la aplicación. La cámara requiere conexión segura y permiso del navegador.
