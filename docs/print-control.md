# Impresión temporal de lotes

`/admin/printroulette` y `/admin/printstatics` usan `BatchPrintControl`. Cada pantalla mantiene su tipo de lote y enlace de regreso. El nuevo flujo de estáticos sustituye el antiguo administrador persistente de plantillas: seleccionar una imagen local, revisar la composición y generar el PDF. No crea plantillas en la base, no sube imágenes a almacenamiento permanente y no elimina plantillas anteriores.

## Datos limitados

`GET /api/admin/print/batches?kind=roulette|static` exige administración o coordinación. Filtra el tipo en servidor y devuelve los últimos diez lotes, con identificador, descripción, creación y cantidades; no devuelve tokens ni imágenes. Una sola consulta agrupada calcula reservas para los lotes devueltos. Si `preselect` apunta a un lote anterior del tipo correcto, se incorpora únicamente ese lote adicional. El endpoint anterior de ruleta delega en el mismo servicio para conservar compatibilidad.

El listado no tiene sondeo ni carga de historial completo. Las pantallas ya no consultan `/api/admin/batches`, reservas por cada lote ni el catálogo de plantillas persistentes.

## Ciclo de vida

La plantilla se conserva únicamente en memoria de la pantalla. La vista previa se genera por POST cuando se selecciona una imagen; cambiarla cancela la solicitud anterior y libera su URL temporal. La generación del PDF solo ocurre al pulsar el botón. Tras descargarlo se limpian archivo y vista previa; las URLs de descarga se revocan tras el margen de descarga y al desmontar. Salir cancela las solicitudes del panel y limpia los recursos locales. Cancelar una petición en el navegador no garantiza interrumpir una composición ya iniciada en el servidor, pero no la convierte en trabajo persistente.

Los endpoints de vista previa y PDF reciben el archivo por multipart y lo procesan para esa solicitud, sin crear una plantilla permanente. La respuesta PDF es privada y no se almacena en caché. El generador de PDF conserva la distribución, límite de exportación y rutas QR existentes (`/static/` frente a `/r/`). Las APIs de plantillas persistentes se mantienen para otros consumidores; esta pantalla no las utiliza.

Las reglas compartidas de tamaño, formatos, cantidad reciente y liberación se encuentran en `src/lib/print/control-policy.ts`. No hay migraciones ni modificaciones de premios, lotes o canjes por abrir el panel.
