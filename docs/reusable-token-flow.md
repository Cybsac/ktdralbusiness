# Flujo de tokens reutilizables

## Ámbito y compatibilidad

`/admin/reusable-tokens` conserva sus pestañas, formularios y distribución. Los premios reutilizables mantienen sus tablas propias y la generación automática de key/color ya existente. Los identificadores, límites, notas y historiales anteriores no se regeneran. La administración comparte los roles STAFF, COORDINATOR y ADMIN definidos en `lib/reusable-tokens/policy.ts`; la entrega sigue usando la autorización por sesión activa u OTP personal.

Se retiraron dos rutas sin consumidores de la aplicación: `POST /api/admin/reusable-tokens/generate` (respondía siempre 410) y `GET /api/admin/reusable-tokens` (mezclaba el modelo histórico Token/Batch con el modelo actual ReusableToken). Las rutas vigentes de generación, consulta, historial, borrado y entrega se conservan. El lector de imágenes QR mantiene su soporte de registros históricos reales, usando ahora la misma resolución de URL base.

## Generación recuperable

`request.ts` valida usos enteros entre 1 y el límite configurado, premio, grupo opcional, descripción y una vigencia explícita. Se rechazan fechas inválidas o pasadas y duraciones no positivas. El servidor vuelve a comprobar que el premio esté activo y el grupo exista.

La generación admite días, fecha concreta o ventana diaria. No se aplica un año silenciosamente ante datos incompletos. La duración global de las ventanas recurrentes es la política explícita `timeWindowLifetimeDays`, conservando los 365 días del comportamiento anterior.

El formulario envía un `requestKey` UUID y conserva la operación pendiente en sessionStorage para recuperarla tras un fallo de red. El servidor guarda su clave por usuario y la huella de los parámetros: repetir la misma solicitud devuelve el token existente; reutilizar la clave con otros parámetros devuelve conflicto. Una transacción serializable y restricciones únicas protegen los reintentos concurrentes. La firma de las nuevas filas utiliza el mecanismo central de firmas; las firmas históricas se conservan y no se convierten en un nuevo requisito para abrir o entregar un QR existente.

La respuesta incluye usos, grupo, horario, fecha y nota, de modo que la tarjeta recién generada representa la misma información que el listado.

## Vigencia compartida

`validity.ts` se usa tanto en la pantalla pública como en el servidor. Compara horas y minutos, contempla ventanas nocturnas y medianoche. El formulario representa medianoche como `00:00`, válido para inputs de hora; la API también acepta `24:00` como extremo final. Las ventanas son inclusivas al inicio y exclusivas al final. `00:00–24:00` representa el día completo; extremos idénticos sin esa distinción se rechazan al generar.

La zona se define en `REUSABLE_TIMEZONE`, configurable mediante `NEXT_PUBLIC_TOKENS_TIMEZONE` y con el valor predeterminado del negocio. Los tokens anteriores con fechas de horario siguen interpretándose como horarios recurrentes; no se modifican sus filas.

## Consumo y responsable

Ambas rutas, `/api/reusable/:id/redeem` y `/api/admin/reusable-tokens/:id/deliver`, delegan en `consumeReusableToken`. Se bloquea la fila del token, se verifica el premio activo y se comprueban deshabilitación, vencimiento, horario y usos disponibles dentro de la transacción. El descuento de un uso, las fechas de canje y entrega, el responsable y el historial se escriben juntos. La acción de origen se conserva en el tipo del historial.

El teléfono aporta un `operationKey` por intento de entrega y lo conserva durante sus reintentos en esa pantalla. La misma operación registrada no vuelve a consumir un uso. Los consumidores anteriores que no envían esa clave mantienen el contrato de una operación nueva por solicitud. No hay entrega automática por consultar o escanear un QR.

## Cargas y borrado

El panel carga resúmenes de grupos, incluyendo sus totales agregados, y obtiene los tokens al desplegar cada grupo. Colapsarlo libera la colección y cancela su petición. Cambiar de página solo consulta tokens recientes; no vuelve a cargar premios ni grupos. Se validan página y tamaño, con máximo configurado y orden estable. Se retiran las marcas `Date.now()` de las imágenes QR para evitar nuevas descargas por cada render. Las URLs de grupos, imágenes y tokens usan `getPublicBaseUrl`.

El endpoint de grupos conserva su respuesta completa sin `summary=1` para los consumidores existentes del área de colaboradores. La pantalla de purga conserva su lista completa solicitada expresamente; no se carga desde el panel principal.

El borrado individual y múltiple comparte una transacción con bloqueo de filas. Solo elimina tokens con cero usos y sin historial; nunca borra canjes para forzar una eliminación. El borrado de un grupo desvincula sus tokens y elimina el grupo dentro de una sola transacción, sin borrar los tokens.

## Migración y verificación

`20261031220000_reusable_operation_keys` agrega columnas opcionales e índices únicos para generación y operaciones. No actualiza ni elimina filas históricas. Antes de aplicarla se guardó una copia privada; después se verificaron todos los campos anteriores de 207 tokens y 1.966 registros de canje, sin cambios.

La comprobación aislada usa dobles de Prisma y PostgreSQL en memoria. Cubrió horarios, validación, generación recuperable, duplicados de entrega, bloqueos de disponibilidad y preservación de filas al migrar. No se realizaron generaciones, canjes ni pruebas de borrado sobre la base de negocio. Las pruebas se mantienen en local.


## Depuración de tokens

En `/admin/reusable-tokens/purge`, la búsqueda y el filtro de uso se aplican en el servidor antes de paginar. Se pueden marcar tokens individuales o seleccionar todos los eliminables que coincidan con los filtros, incluidas otras páginas. La selección total queda limitada a los tokens creados hasta el momento de la consulta y se procesa por lotes. Cada lote vuelve a comprobar bajo bloqueo que el token tenga cero usos y ningún registro de canje o entrega; si cambió, se omite. Si falla un lote, la pantalla informa cuántos se eliminaron antes del error. La eliminación requiere confirmación en la interfaz y no altera tokens con historial.
