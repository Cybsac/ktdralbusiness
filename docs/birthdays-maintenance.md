# Cumpleaños: mantenimiento y arquitectura

Actualizado: 31 de octubre de 2026.

## Invitación universal

Cada reserva utiliza una tarjeta con un QR. Los nuevos códigos mantienen el tipo interno `guest`; los códigos históricos `host` y `guest` siguen siendo válidos. Registrar la llegada del cumpleañero no consume cupos de invitados. Regenerar la imagen conserva códigos, usos e historial.

El servicio está separado en módulos de creación, consulta, edición, estados, invitaciones, ingresos, cortesías, fotos y mantenimiento. Las reglas compartidas están en `policy.ts`, `calendar.ts` y `reservation-input.ts`. Las fechas preservan compatibilidad con registros históricos UTC y locales.

La creación y reactivación comprueban DNI/año con bloqueo transaccional. La edición verifica versión. Los ingresos validan estado, fecha, vencimiento, firma y cupos; actualizan consumo, historial y contadores en una transacción. El cliente público utiliza una clave de operación para evitar ingresos duplicados al reintentar. Las consultas paginan en la base y no generan archivos al listar.

La reserva pública consulta los horarios disponibles y verifica nuevamente su capacidad al crearla. Las creaciones públicas del mismo horario se serializan en la transacción; las reservas de administración conservan su flujo operativo. El pack público debe estar activo y no ser personalizado, y los invitados previstos se toman de ese pack. Si falla la generación del QR después de guardar, el formulario permite reintentar con la reserva existente. La cancelación pública exige el enlace firmado de esa reserva y no procede si ya hay llegadas. Los comentarios y datos de reservas se conservan.

Las tarjetas nuevas almacenadas se generan en WebP (calidad 92, 1080 × 1920) y se suben directamente desde memoria con el tipo `image/webp`. Las referencias PNG históricas siguen siendo válidas y las descargas explícitas en PNG se mantienen. Regenerar conserva el código y sustituye la referencia mediante la cola de limpieza existente; no hay migración ni borrado masivo de imágenes.

## Limpieza automática de tarjetas

`card-scheduler.ts` inicia una tarea por proceso de producción mediante el registro de instrumentación de Next. Corre al iniciar y según la frecuencia configurada. No depende del interruptor del programador global de tokens, no requiere visitas al administrador y no se ejecuta durante compilaciones ni en desarrollo.

`card-maintenance.ts` selecciona por lotes reservas canceladas o con fecha pasada que tengan tarjetas. `retention.ts` revalida bajo bloqueo antes de retirar sus referencias: conserva una celebración mientras su fecha o alguno de sus QR siga vigente. Esto protege reprogramaciones y reactivaciones concurrentes. El estado `completed` por sí solo no elimina la tarjeta, pues también registra la llegada del cumpleañero mientras los invitados aún pueden ingresar.

Cancelar intenta limpiar inmediatamente; los fallos se recuperan en siguientes ejecuciones. Las reservas, códigos, usos e historial se conservan. La generación y exportación de tarjetas vencidas o no habilitadas quedan bloqueadas.

El inventario incremental del bucket `birthday-cards` encuentra archivos históricos sin referencia. Protege referencias existentes, celebraciones y QR vigentes, archivos recientes y subidas en curso. Recorre carpetas y páginas por lotes; al reiniciar comienza nuevamente el recorrido, conservando la cola durable. No modifica plantillas ni otros buckets.

`BirthdayStorageCleanup` registra borrados pendientes antes de retirar referencias y también subidas interrumpidas. El trabajador utiliza lotes limitados, reintentos y reservas temporales del trabajo. Antes de borrar comprueba que ninguna tarjeta siga referenciando el archivo. Los trabajos fallidos permanecen registrados.

`POST /api/admin/birthdays/storage-cleanup`, protegido para administradores, permite ejecutar una pasada manual del mantenimiento. La herramienta `purge-cards` elimina únicamente tarjetas y archivos. La eliminación completa explícita de pedidos exige una reserva cancelada y es transaccional. No borrar tokens ni reservas para regenerar imágenes.

## Paquetes y referidores

El portal `/u/birthdays` permite a los colaboradores activos consultar los paquetes activos, incluido el personalizado, sin modificar el catálogo. La pantalla administrativa y las API de configuración, restauración y base del catálogo requieren un usuario activo con rol `ADMIN`; los demás roles conservan sus permisos operativos de reservas. Leer paquetes no crea registros. `BirthdayPackCatalog` conserva la base restaurable, inicialmente copiada de los paquetes existentes; no hay precios ni beneficios comerciales fijos en código. `POST /api/admin/birthdays/packs/restore` restaura esa base; `PUT` en la misma ruta guarda explícitamente el catálogo actual como nueva base con autorización administrativa.

Las métricas se agregan en la base de datos. El porcentaje de referidores refleja reservas completadas sobre el total.

## Consolidado de reservas

`/admin/birthdays/consolidado` es de acceso exclusivo para administradores activos. Consulta las reservas existentes sin duplicarlas; permite filtrar por fecha de celebración o registro, estado, pack, origen, usuario creador vinculado y búsqueda. También permite consultar reservas sin usuario vinculado; el campo antiguo de texto no acredita por sí mismo la identidad del creador. Los indicadores y la lista usan los mismos filtros y una lectura consistente; la lista se pagina en la base y admite vista de tarjetas o filas. El estado completado y las llegadas son indicadores distintos. El origen, creador y referidor históricos que no estén registrados se muestran como tales. Los datos del pack son actuales, no una prueba de su precio o beneficios históricos. Las reservas eliminadas definitivamente no pueden incluirse.

En la vista por filas se puede ordenar toda la consulta por fecha de celebración o por la llegada del cumpleañero, antes de paginar. Llegada usa exclusivamente `hostArrivedAt`; los ingresos de invitados no alteran ese orden.

## Configuración

- `BIRTHDAY_CLEANUP_CRON`: frecuencia automática; por defecto cada diez minutos. Una expresión inválida impide iniciar la tarea y registra el error.
- `BIRTHDAY_CLEANUP_BATCH_SIZE`: máximo de reservas/trabajos por pasada; por defecto 10.
- `BIRTHDAY_STORAGE_SCAN_PAGE_SIZE`: objetos/carpetas por página del inventario; por defecto 100.
- `NEXT_PUBLIC_BIRTHDAY_TIMEZONE`: zona de calendario; por defecto America/Lima.
- `NEXT_PUBLIC_BIRTHDAY_SLOTS`: horarios públicos separados por comas.
- `NEXT_PUBLIC_BIRTHDAY_STAFF_SLOTS`: horarios del portal de colaboradores, separados por comas.
- `BIRTHDAY_MAX_RESERVATIONS_PER_SLOT`: capacidad por horario.
- `BIRTHDAY_SURPRISE_DUPLICATE_WINDOW_DAYS`: días antes y después de la celebración para advertir sobre posibles reservas sorpresa repetidas del mismo organizador; por defecto 7. La advertencia no impide continuar.
- `BIRTHDAY_SURPRISE_LOCAL_ENABLED=1`: habilita la creación de sorpresas fuera de producción solo cuando la base sea aislada o todas las aplicaciones que la usan soporten el DNI opcional. No activarla en desarrollo si comparte base con una versión anterior en producción.
- La plantilla universal se configura en `/admin/birthdays/template` para administradores activos. Se guarda como `birthday-templates/newversioncard.webp`, sobrescribiendo ese único objeto; se admiten JPG, PNG y WebP 9:16 de al menos 1080 × 1920 y hasta 10 MB, normalizados a WebP 1080 × 1920. La regeneración manual conserva los códigos y se permite solo mientras la reserva esté vigente. Las imágenes guardadas anteriormente no cambian hasta regenerarse. La antigua variable `BIRTHDAY_TEMPLATE_URL` ya no determina la plantilla.
- `NEXT_PUBLIC_SUPABASE_URL`: origen de almacenamiento para la plantilla predeterminada.

## Migración y validación

La migración `20261031233000_birthday_pack_catalog` agrega el catálogo base y la cola de limpieza. No modifica reservas, tokens ni historial. La comparación completa de las ocho tablas originales confirmó la conservación de 1000 reservas, 1039 tokens, 219 ingresos, cinco paquetes y un referidor. El catálogo base contiene esos cinco paquetes.

El refactor inicial pasó 21 casos aislados y el chequeo de tipos. La limpieza automática añadió cobertura para vencimiento, cancelación, reprogramación, QR históricos vigentes, archivos sin reserva, referencias activas, subidas en curso y fallos de almacenamiento. No se ejecutaron borrados reales de Supabase ni pruebas destructivas sobre la base de datos. Los archivos de pruebas permanecen locales.
