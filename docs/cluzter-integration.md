# Integración de Cluzter

La capa de servidor `src/lib/cluzter` concentra configuración, transporte y errores; `lookupDni` es la primera operación y solo conserva DNI, nombres, apellidos y fecha de nacimiento válida. La consulta de DNI se utiliza en el alta y la edición administrativas y en el autorregistro. El endpoint administrativo exige ADMIN o COORDINATOR activo; el de autorregistro es público por decisión del usuario, sin verificación telefónica. Ambos limitan consultas con contadores compartidos en PostgreSQL, no exponen la clave y devuelven solo nombre, fecha de nacimiento y código de sexo del documento. El límite público es global y por grupos de origen (puede haber colisiones conservadoras); la identificación de IP depende de la configuración confiable del proxy. No conectar directamente esta capa desde componentes cliente.

## Configuración

- `CLUZTER_API_TOKEN`: credencial privada, solo servidor, obligatoria. Guardar en el gestor de secretos del entorno o en `.env.local` para desarrollo; nunca en `NEXT_PUBLIC_*` ni en Git.
- `CLUZTER_API_BASE_URL`: origen HTTPS opcional; por defecto `https://api2.cluzter.dev`.
- `CLUZTER_TIMEOUT_MS`: límite opcional entre 500 y 60000 ms; por defecto 8000.

El transporte no registra el DNI, la credencial, URL de solicitud ni la respuesta, bloquea redirecciones y no reintenta consultas automáticamente porque podrían consumir créditos. Los errores de autorización, cuota, límites, datos y disponibilidad se distinguen mediante códigos, sin propagar respuestas completas del proveedor. El éxito se valida y se rechaza si corresponde a otro DNI. No se guardan en caché las respuestas del proveedor. Los contadores compartidos limitan las consultas; los límites y la ventana pueden configurarse con `CLUZTER_EMPLOYEE_WINDOW_LIMIT`, `CLUZTER_PUBLIC_WINDOW_LIMIT`, `CLUZTER_PUBLIC_GLOBAL_LIMIT`, `CLUZTER_PUBLIC_LIMIT_BUCKETS` y `CLUZTER_EMPLOYEE_WINDOW_MS`.

La función de edad recibe fechas de calendario `YYYY-MM-DD`; datos inválidos, ausentes o futuros producen un resultado desconocido y nunca deben tratarse como mayor de edad. La comparación usa el 1 de marzo como aniversario de una persona nacida el 29 de febrero en años no bisiestos; esta convención debe revisarse con la política aplicable antes de usarla en decisiones de acceso. Una consulta de DNI no acredita que el documento pertenezca a quien lo presenta. El caso de uso decidirá qué hacer ante un servicio no disponible y qué personal puede consultar; no se habilita aún bloqueo automático de reservas ni ingresos.

Para pruebas usar datos simulados, sin enviar DNI reales ni consumir créditos. El token local se lee cuando arranca el servidor; reiniciarlo tras modificarlo. El código de sexo se conserva tal como lo entrega Cluzter (1 o 2); la equivalencia exacta debe confirmarse con el proveedor antes de convertirlo en una categoría. La consulta abierta no verifica que quien introduce el DNI sea su titular.

## Tipos de documento

Los perfiles admiten DNI peruano (`DNI`), carnet de extranjería (`CE`) u otro (`OTHER`). Los históricos sin confirmar permanecen sin tipo; no se deduce a partir del número. Solo un DNI seleccionado explícitamente habilita la consulta Cluzter; el endpoint también exige el tipo y la sincronización masiva omite tipos distintos o desconocidos. Al cambiar el documento se revierten los campos que la consulta había completado y que no fueron modificados manualmente. El número de documento sigue siendo único globalmente por compatibilidad con el inicio de sesión existente; números iguales de distintos tipos aún requieren resolución manual.


## Consulta pública protegida

Para habilitar las consultas públicas, configurar un widget Cloudflare Turnstile y las variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` y `TURNSTILE_ALLOWED_HOSTNAMES` (nombres de host separados por comas, sin protocolo ni puerto). Añadir localhost al widget y a la lista si corresponde. La clave pública debe estar disponible durante la construcción de la aplicación; reconstruir al modificarla. Si falla la verificación, se rechaza la consulta pública; las consultas internas autorizadas siguen disponibles. El autorregistro conserva el ingreso manual, pero la reserva pública necesita la consulta para completar el nombre y la fecha. Si el proveedor no devuelve la fecha, se solicita contactar al equipo. La creación pública comprueba una prueba firmada de DNI, nombre y fecha, válida durante una hora y emitida por el servidor tras la consulta; requiere `TOKEN_SECRET`. No demuestra que quien presenta el DNI sea su titular. La fecha de nacimiento se almacena en un campo independiente y opcional para conservar compatibilidad con datos históricos.
