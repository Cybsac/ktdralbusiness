# Identificación de responsables de canje

## Dos vías de autorización

- **Sesión activa de una cuenta de usuario**: COLLAB, STAFF, COORDINATOR, ADMIN y cualquier otro rol válido de cuenta activa pueden confirmar la entrega sin OTP. El responsable es el usuario de la sesión, consultado en la base de datos. Una cuenta inactiva o una cookie inválida no omiten la validación.
- **Teléfono público sin sesión**: el botón de entrega está disponible, pero pide seis dígitos. El OTP personal identifica al colaborador habilitado por administración. El servidor proporciona esa identidad a la operación; nunca se acepta un identificador de colaborador enviado por el cliente.

La política de vigencia afecta al canje público con OTP. Desactivarla o estar fuera de sus fechas cierra el canje público, sin bloquear las entregas de cuentas con sesión. Ver o revelar un premio no consume usos.

## Administración y consulta personal

Abrir `/admin/prize-authorization` con ADMIN o COORDINATOR, también enlazado desde los administradores de premios, estáticos y reutilizables. Al guardar la configuración general se habilitan automáticamente las claves de todas las cuentas activas que aún no tienen credencial, dentro de la misma transacción. También ocurre en guardados posteriores para incorporar nuevos colaboradores. No se reactivan las claves revocadas ni se habilitan cuentas inactivas. La revocación y el reemplazo individual siguen disponibles.

Cada colaborador puede consultar únicamente su propia clave en `/u/prize-authorization`, accesible desde «Mi clave de canjes». Solo administración ve el listado completo y puede habilitar, revocar o reemplazar una clave individual. Revocar la clave pública no desactiva la cuenta ni impide entregar con una sesión activa.

Se conserva la rotación diaria, semanal (lunes), mensual, por minutos o fija; vigencia permanente, por rango o fechas concretas, días de la semana y zona horaria configurable, inicialmente America/Lima. Guardar cambios generales reemplaza todas las claves vigentes; reemplazar una credencial cambia solo la clave de esa persona.

## Unicidad y trazabilidad

Cada credencial tiene un secreto aleatorio propio. Su clave se deriva por HMAC con período, revisión y un contador para resolver colisiones. La asignación de claves se serializa con un bloqueo de fila de configuración y existe un índice único sobre el hash del código: dos colaboradores no pueden tener la misma clave vigente. La clave precedente de una credencial tampoco se reutiliza al rotarla.

Los códigos no se incluyen en los QR, no se guardan en el navegador ni se escriben en registros. El control de intentos públicos por IP usa PostgreSQL y es compartido por las instancias, sin proveedores de SMS, correo ni autenticadores externos.

`requirePrizeAuthorization(request, scope)` se llama antes de consumir un premio. Si devuelve una respuesta, la operación termina. Si autoriza, `getPrizeActor(request)` devuelve el responsable y el método (`session` u `otp`) desde un contexto privado de esa solicitud. No volver a exigir una cookie después del guard: impediría las entregas públicas válidas. La autorización registra usuario, nombre, recurso y método; las operaciones guardan ese responsable en sus campos e historiales de entrega. Un OTP válido identifica la credencial utilizada, por lo que cada colaborador debe mantener su clave privada.

## Cobertura y límites

Ruleta, raspa y gana, QR estáticos y reutilizables, canje directo, QR personalizados, ofertas, premios Mundial, puntos y cortesías de cumpleaños usan el mismo guard. Las rutas de compatibilidad delegan o verifican la misma autorización. El middleware permite que los endpoints finales de entrega resuelvan OTP públicos, manteniendo privados el panel y las APIs administrativas.

Las entregas reutilizables incrementan el contador de forma condicionada y registran el historial en una transacción. La vista pública permanece en el comprobante después de entregar. La generación de QR en estas vistas utiliza la biblioteca local.

El intercambio público sigue cerrado en la página y sus APIs. Su espacio administrativo se conserva para una publicación futura, sin cambiar las autorizaciones de administración. Las validaciones de asistencia y entradas que no entregan premios mantienen su comportamiento.

## Esquema y comprobaciones

- `20261026120000_prize_authorization`: configuración general y control de intentos.
- `20261026143000_personal_prize_codes`: credenciales por usuario y registro único de códigos. Solo agrega tablas; no modifica premios, tokens ni historiales existentes.

Generar el cliente Prisma y aplicar las migraciones antes de desplegar. Las claves públicas se habilitan automáticamente al guardar la configuración inicial; las sesiones activas no dependen de esa configuración.

Ejecutar únicamente `npx vitest run tests/prize-authorization` para las comprobaciones del módulo. Estas pruebas sustituyen Prisma, sesiones y red por simulaciones; no consultan ni alteran una base real. No ejecutar suites generales o E2E contra bases con datos reales.


## Actualización en tiempo real

La única implementación de Socket.IO es `src/lib/socket.ts`. El servidor personalizado la inicia después de cargar la configuración de Next. `/api/socketio` es exclusivamente un adaptador de arranque para `next start` y standalone; delega en esa misma instancia y no crea una implementación paralela. La referencia del servidor se comparte por proceso para que los emisores de rutas y el arranque vean el mismo objeto durante la recarga de módulos.

`src/lib/socket-contract.ts` centraliza el transporte (`NEXT_PUBLIC_SOCKET_PATH`, por defecto `/socket.io`). Esta variable debe coincidir en construcción y ejecución. `NEXT_PUBLIC_SOCKET_URL` permite un origen específico si hace falta; por defecto se usa el origen del navegador. `SOCKET_ALLOWED_ORIGINS` permite declarar orígenes adicionales; sin esa opción, se acepta el mismo host. No hay puertos ni dominios locales incrustados en los clientes.

Los consumidores usan una conexión compartida con conteo de referencias y la liberan al desmontarse. La suscripción a notificaciones OTP se autentica mediante la cookie y la cuenta activa, y el servidor determina las salas personal y administrativa. No se acepta un identificador de colaborador enviado por el socket.

Después de confirmar un cambio de configuración o credencial, el servidor emite `prize-authorization:changed`. El mensaje solo indica si cambió configuración o credencial: nunca transporta códigos, secretos ni datos de colaboradores. Los cambios individuales llegan al dueño y a administración; los generales llegan a las cuentas autenticadas suscritas. Si una conexión pertenece a varias salas, recibe una sola notificación.

`usePrizeAuthorizationRefresh` vuelve a consultar la API privada, sin sobrescribir ediciones pendientes del panel. También actualiza al reconectar, recuperar el foco, volver visible la página, alcanzar el cambio de período y mediante la consulta de respaldo cada 30 segundos. Las lecturas se agrupan para impedir que una respuesta antigua sea el último estado y se cancelan al salir de la página.

El aviso instantáneo alcanza a los clientes de la misma instancia del servidor. En despliegues con varias instancias sin adaptador distribuido, la API y la consulta periódica mantienen la consistencia entre instancias. Los sockets nunca autorizan un canje: la base de datos sigue siendo la fuente de validación, incluso sin conexión en tiempo real.

Las pruebas de `tests/realtime` abren únicamente servidores HTTP efímeros y usan identidades simuladas; no consultan ni modifican una base real.


## Acceso discreto a entrega en páginas de premios

`PrizeDeliveryAction` centraliza la acción secundaria «Personal: registrar entrega».
Se usa en reutilizables, estáticos, premios revelados, ruleta, jugadas Mundial,
Fan Zone y validación de ofertas. Mantiene un área táctil accesible sin fondo de
botón principal, con foco de teclado y estados de espera/deshabilitado.

El componente adapta la presentación a la sesión: botón «Registrar entrega» para
personal autenticado y enlace discreto para público. Cada flujo conserva su callback,
`prizeAuthorizedFetch`, elegibilidad y manejo de errores. Usa la sesión ya resuelta cuando está disponible; las demás pantallas comparten
una consulta de sesión, que se actualiza al recuperar el foco. No duplica permisos. El servidor decide si corresponde solicitar OTP o usar la
identidad de la sesión. No se cambian controles de administración de sorteos,
aprobaciones de intercambio ni operaciones de restaurante.
