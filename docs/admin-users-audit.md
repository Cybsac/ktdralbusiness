# Auditoría de gestión de usuarios

Fecha: 1 de noviembre de 2026.

## Alcance y cambio aplicado

Se revisaron `/u/login`, `/admin/users`, React Admin y su proveedor de datos, altas, edición, eliminación, contraseña individual, recuperación OTP, respaldo y restauración. La revisión fue de código: no se crearon cuentas ni se ejecutaron restablecimientos, restauraciones o borrados reales.

Solo se retiró del login el bloque temporal que afirmaba que todas las contraseñas habían sido restablecidas al documento y su comentario obsoleto. No se modificaron credenciales ni reglas de autenticación. La interfaz de administración permanece intacta.

`/admin/users#/users` no es otra página: `#/users` es la ruta interna que utiliza React Admin dentro de `/admin/users`. El fragmento no llega al servidor y debe conservarse compatible con edición y creación.

## Hallazgos prioritarios

1. **El contrato del listado no coincide con React Admin.** `react-admin-data-provider.ts` envía `sort`, `range` y `filter`, pero `GET /api/admin/users` los ignora y carga todas las cuentas. No devuelve el total global del contrato; el proveedor lo deduce del tamaño del arreglo. Los controles de orden, paginación y filtros no representan operaciones reales del servidor. `getMany` también envía IDs como filtro que se ignora.
2. **El formulario permite cambiar campos que no se guardan.** `UserEdit` presenta username y DNI editables, pero el proveedor los omite y PATCH tampoco los procesa. Guardar y volver a consultar devuelve los valores anteriores. WhatsApp no puede limpiarse: el cliente envía null y el servidor lo ignora.
3. **Las escrituras de edición no son atómicas.** PATCH cambia rol antes de validar nombre, área, teléfono y cumpleaños. Puede devolver un error después de haber guardado parte de los cambios. El proveedor guarda primero el perfil y después la contraseña en otra solicitud, con el mismo problema de resultado parcial.
4. **Permisos distintos según endpoint.** La edición de perfil impide a COORDINATOR modificar un ADMIN, pero el endpoint dedicado de contraseña y el de OTP no comprueban el rol de la cuenta objetivo. El restablecimiento global permite COORDINATOR, aunque el comentario y la sección se presentan como exclusivos de ADMIN. Las rutas confían en el rol de la cookie sin consultar si la cuenta sigue activa ni su rol actual.
5. **Acción global con contraseña fija.** El botón envía un cuerpo vacío y el servidor usa una contraseña compartida fija para todas las cuentas. No es equivalente al texto histórico de restablecer al DNI. La validación de contraseña también difiere: mínimo seis en PATCH general, ocho al crear o usar el endpoint dedicado.
6. **El respaldo no es una restauración completa.** No exporta credenciales. Las cuentas nuevas se crean con un hash ficticio y no se marca explícitamente el cambio obligatorio. La importación valida solo la estructura exterior, procesa registros y entidades fuera de una transacción y puede dejar personas sin usuario o resultados parciales; aun con errores devuelve éxito. En cuentas existentes no restaura toda la información exportada, incluido staff. Usa otro PrismaClient.
7. **La eliminación borra historial relacionado.** Además de usuario y persona elimina comentarios, marcaciones, valoraciones y otros registros. No hay protección explícita contra eliminarse a sí mismo o al último administrador. STAFF ve botones de eliminar para todas las filas, aunque el servidor solo permite COLLAB. Su cliente espera `ok: true`, pero DELETE devuelve `{data:{id}}`: puede mostrar error después de una eliminación exitosa.
8. **El cambio obligatorio de contraseña tiene un contrato desalineado en el login.** La API devuelve `user.forcePasswordChange`, pero la pantalla consulta `data.forcePasswordChange`. Retirar el aviso no elimina esta inconsistencia preexistente. Además, los fallos de login devuelven `code`/`message` y la pantalla busca `error`; el destino `next` se utiliza sin validar que sea una ruta local.

## Mantenimiento y comportamiento de pantalla

- `ReactAdminUsers.tsx` y `ReactAdminClient.tsx` forman una implementación alternativa sin consumidores fuera de sí mismos. Duplican tema, recursos y layout de `UsersWithTabs`.
- Áreas y roles se repiten en UserList, UserCreate y UserEdit, pese a existir `lib/areas.ts`. Los generadores de códigos EMP y sus funciones auxiliares siguen en la ruta de alta sin usarse; el código vigente se deriva del documento.
- Los métodos `updateMany` y `deleteMany` del proveedor devuelven objetos en vez de IDs, contrario al contrato de React Admin. El proveedor es compartido con `/u/equipo`: no cambiarlo globalmente sin revisar ese consumidor.
- ADMIN y COORDINATOR reciben el mismo componente de pestañas; se muestran acciones exclusivas de ADMIN que la API rechaza al coordinador. El rol no se pasa al componente para ajustar capacidades.
- El tema MUI se reconstruye en cada render; el tema y layout se duplican en la implementación alternativa. Conviene revisar el alcance global de CssBaseline y el montaje/desmontaje al cambiar pestaña conservando el aspecto actual.
- El listado STAFF oculta errores de carga. Su indicación de permisos no coincide con todas las restricciones del servidor.
- La creación transforma silenciosamente una petición de rol no permitido por COORDINATOR en STAFF. La validación de documentos elimina letras, aunque el aviso histórico mencionaba CE/pasaporte. La normalización debe definirse y compartirse con acceso y personal.
- El OTP de recuperación usa Math.random y una inserción SQL histórica cuyo comentario evita regenerar Prisma, aunque el modelo existe. Es un flujo distinto del OTP personal de entrega de premios y no debe mezclarse con él.

## Refactor propuesto sin rediseño

1. Centralizar autorización por actor y cuenta objetivo, validación, normalización y formato de respuestas. Resolver primero contraseña, rol vigente y operaciones parciales; mantener compatibles las rutas.
2. Separar consultas y escrituras en servicios. Implementar filtrado, orden y paginación reales para React Admin, conservando el listado simple STAFF y revisando `/u/equipo`. Hacer explícito qué campos se pueden editar y guardarlos transaccionalmente.
3. Alinear capacidades visibles, respuestas de eliminación y comportamiento de pestañas. Extraer tema, opciones y controles compartidos y retirar la implementación alternativa después de verificar consumidores.
4. Sustituir el restablecimiento global heredado por una recuperación controlada y documentada. Validar íntegramente los respaldos antes de escribir y definir qué preserva la restauración. Cualquier verificación de estas operaciones debe usar datos simulados o una base aislada.

## Implementación posterior

Los hallazgos anteriores corresponden al diagnóstico inicial. Se implementó la corrección coordinada conservando la UI, con validación aislada y sin modificar cuentas reales durante las pruebas. El comportamiento vigente, incluyendo archivo de cuentas, recuperación y límites del respaldo, se documenta en [Gestión de usuarios](user-management.md).
