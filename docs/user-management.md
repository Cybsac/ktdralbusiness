# Gestión de usuarios y acceso

Actualizado: 1 de noviembre de 2026.

## Alcance

`/admin/users` conserva la interfaz con pestañas y las pantallas de React Admin. `#/users` sigue siendo su ruta interna compatible. STAFF conserva su listado simplificado. El proveedor continúa compartido con `/u/equipo`.

Los servicios están en `src/lib/users`: acceso, políticas, validación, consultas, escrituras, contraseñas y respaldos. Las rutas HTTP validan y delegan; no contienen generadores antiguos EMP, clientes Prisma adicionales ni cambios de contraseña alternativos con reglas distintas.

Se retiraron `ReactAdminUsers.tsx` y `ReactAdminClient.tsx`, cuya implementación alternativa no tenía consumidores. El tema existente se extrae y memoriza, y áreas/roles usan opciones compartidas. La disposición y estilos se conservan; las acciones visibles y habilitadas respetan permisos reales. El aviso temporal del login se eliminó.

## Consultas y edición

React Admin envía `sort`, `range` y `filter`. La API los valida y aplica en PostgreSQL, devuelve `data`, `users` y `total`, y utiliza orden estable. `getMany` respeta los IDs solicitados. Las peticiones sin rango conservan el listado completo compatible de cuentas activas para STAFF. Las respuestas privadas no se almacenan en caché.

El proveedor guarda perfil y contraseña en una sola petición. Username y documento se guardan realmente; WhatsApp y cumpleaños pueden limpiarse. Cuando el código de persona deriva del documento, ambos cambian juntos; los códigos históricos independientes se conservan. Las operaciones masivas del proveedor devuelven IDs, como exige React Admin.

La edición envía únicamente los campos modificados, conserva los valores históricos de área aunque ya no aparezcan en el catálogo y admite perfiles sin DNI o área sin reenviar valores nulos inválidos. En pantallas pequeñas las acciones de editar y retirar acceso permanecen disponibles. La retirada se explica como desactivación con historial conservado.

Todas las entradas se validan antes de escribir. Los cambios relacionados se agrupan en una transacción y las operaciones sensibles comparten un bloqueo para proteger concurrencia y el último administrador activo. Las restricciones únicas se traducen en conflictos comprensibles.

## Permisos y sesiones

ADMIN administra cuentas. COORDINATOR crea y modifica STAFF/COLLAB y puede editar su propio perfil sin elevar privilegios. STAFF conserva lectura y retiro de acceso de COLLAB. No se permite eliminarse ni dejar al sistema sin un ADMIN activo. Los endpoints de contraseña y OTP comprueban la misma cuenta objetivo.

El servidor Node vuelve a comprobar existencia, actividad, rol y fecha de actualización de la cuenta al validar una sesión. Una sesión anterior a la actualización de esa cuenta deja de ser válida. Una edición propia o un cambio de contraseña propio emite una cookie renovada. El verificador Edge mantiene solo la comprobación criptográfica; las acciones y páginas del servidor validan el acceso actual.

El login rechaza cuentas inactivas, interpreta `user.forcePasswordChange` y muestra los mensajes reales del servidor. Los destinos de login y cambio de contraseña solo admiten rutas locales, conservando el hash de navegación.

## Retirar una cuenta sin destruir historial

DELETE conserva el botón y contrato de eliminación, pero archiva el acceso: desactiva la persona, su registro de staff y su credencial de entrega de premios; retira los códigos de recuperación. Conserva usuario, identidad, comentarios, marcaciones, valoraciones y otras relaciones históricas. Devuelve `ok` y `data.id`, por lo que ambos clientes reconocen el éxito.

Las cuentas archivadas dejan de aparecer en el listado operativo y no pueden iniciar sesión. Sus identificadores siguen reservados; no se recicla una identidad histórica al crear otra cuenta. Una restauración explícita de perfiles puede reactivar la persona, pero no habilita automáticamente una credencial de entrega revocada.

## Contraseñas y recuperación

La política compartida exige el mínimo definido en `USER_POLICY` y respeta el límite de bytes de bcrypt. Los cambios administrativos requieren un nuevo cambio por parte del usuario. Los hashes se calculan de manera asíncrona y no se registran contraseñas en auditoría.

El restablecimiento global antiguo ya no utiliza una contraseña fija. Solo ADMIN puede ejecutarlo, con confirmación explícita. Se generan claves temporales criptográficas distintas para las demás cuentas activas; la cuenta del administrador que ejecuta queda fuera. Se descarga una respuesta JSON para distribuirlas. Las claves en claro solo existen en memoria de esa operación y en el archivo descargado; la base almacena hashes. Si se pierde ese archivo, debe emitirse otra recuperación, no existe una consulta posterior de contraseñas.

La recuperación individual utiliza `PasswordResetOtp` mediante Prisma, aleatoriedad criptográfica y vencimiento. Emitir un código invalida los anteriores; consumirlo y actualizar la contraseña ocurren en la misma transacción, con comprobación condicional de uso único. Este código de recuperación no es el OTP personal de cuatro dígitos utilizado para entregar premios.

## Respaldos

El formato exportado versión 2 contiene perfiles, datos de persona, aceptación de compromiso y configuración de staff; no exporta contraseñas ni historial operativo. Sigue admitiendo los respaldos anteriores con esos campos.

La restauración valida todo el archivo, sus límites, fechas, roles y duplicados antes de escribir. Aplica todas las filas dentro de una transacción: no entrega éxito parcial ni deja personas huérfanas. Combina perfiles por username, conserva credenciales de cuentas existentes y restaura los datos de staff. Las cuentas nuevas reciben hashes válidos de claves aleatorias, cambio obligatorio y un archivo de claves para ADMIN. No sustituye una restauración integral de la base de datos ni elimina cuentas ausentes del archivo.

No se permite que el archivo desactive o degrade al administrador que lo ejecuta ni que elimine el último ADMIN activo. Tras una restauración se renueva su sesión.

## Configuración y verificación

No se necesitan migraciones: se utilizan las tablas y campos existentes. `policy.ts` centraliza límites, roles y opciones. Las variables opcionales son `USER_PASSWORD_HASH_ROUNDS`, `USER_RECOVERY_LIFETIME_MS`, `USER_BACKUP_MAX_BYTES`, `USER_BACKUP_MAX_ROWS` y `USER_TRANSACTION_TIMEOUT_MS`.

Se verificaron 27 casos aislados: consultas, filtros, totales, edición, permisos, conservación de historial, último administrador, redirecciones, recuperación, restauración y contrato del proveedor. La base de negocio no se utilizó para crear cuentas, cambiar contraseñas, restaurar respaldos ni eliminar usuarios durante estas comprobaciones. Las pruebas permanecen locales.
Verificación final: el chequeo de tipos y la compilación completa de producción terminaron correctamente. Next conserva las advertencias previas de `crypto` en Edge y de detección de rutas dinámicas; no impidieron la construcción. Esta continuación se publica junto con sus servicios y documentación; la confirmación del despliegue se realiza por separado.
