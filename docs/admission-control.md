# Admisión de clientes

La herramienta está disponible en `/u/admission` y el resumen en `/admin/admission`. Pueden operar usuarios activos ADMIN, COORDINATOR, STAFF y colaboradores del área Seguridad. El resumen está limitado a ADMIN y COORDINATOR. Los permisos se comprueban en el servidor contra el usuario vigente.

La consulta de DNI usa Cluzter desde el servidor; un resultado sin fecha, un error o una persona menor nunca produce una autorización de ingreso. Para CE y otros documentos la edad se evalúa con la fecha introducida a partir de los datos introducidos por el operador. La revisión del documento físico queda a criterio del personal. La consulta de DNI no autentica al portador ni comprueba la autenticidad física del documento.

Un comprobante firmado de corta duración, vinculado al operador y jornada, permite registrar el movimiento sin confiar en la edad enviada desde el navegador. Las entradas duplicadas se rechazan de forma transaccional y los reingresos requieren una salida previa. Los totales de consultas son intentos, no personas únicas. El total dentro es una estimación basada en los movimientos de la jornada y no un aforo oficial. Los QR de cumpleaños no se suman automáticamente: pueden representar a varias personas y producir duplicados.

Los números de documento se almacenan solo como identificadores HMAC; no se guardan nombres, fechas de nacimiento, fotografías ni números de documento en las tablas de admisión. Cada movimiento conserva la jornada, tipo, hora y operador. Definir una política de retención y privacidad antes de implantarla. No existe limpieza automática.

Variables opcionales:

- `ADMISSION_SECRET`: clave estable y privada para firmar comprobantes y derivar identificadores. Si no se define, se utiliza `TOKEN_SECRET`; debe existir en todos los servidores. Cambiar esta clave hace que los documentos de jornadas existentes ya no se reconozcan, y puede causar conteos duplicados; planificar la rotación.
- `ADMISSION_PROOF_TTL_SECONDS`: vigencia del comprobante, entre 30 y 1800 segundos; predeterminado 300.
- `ADMISSION_CHECK_WINDOW_MS` y `ADMISSION_CHECK_WINDOW_LIMIT`: límite compartido por operador; predeterminados 60000 ms y 60 consultas.
- `ATTENDANCE_CUTOFF_HOUR`: hora de corte local de la jornada existente, compartida con asistencia.

Desplegar la migración aditiva con `prisma migrate deploy`. Las pruebas automatizadas de admisión usan datos simulados y no vacían tablas.
