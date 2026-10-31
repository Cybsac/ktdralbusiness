# Catálogo de premios Tokenshow

`/admin/prizes` mantiene un catálogo independiente de jornadas y de Pulseras Interactivas.

- Crear un premio registra su cantidad en `GamePrizeCatalogItem`, identificada por premio.
- Solo aparecen cantidades pendientes positivas o pendientes de definir. Al generar un lote se consume todo el stock numérico preparado, en la misma transacción que crea sus tokens. Los premios agotados desaparecen del catálogo.
- Cambiar el día no vacía ni renueva el catálogo. El stock global de `Prize` no se usa como respaldo.
- Nombre y stock son los únicos campos de creación. Color automático y siempre activo.
- Los resultados especiales conservan su identidad y permiten preparar nuevas cantidades sin reiniciar las existentes.
- La vigencia por días comienza al generar el lote; la fecha específica utiliza la zona y hora de cierre configuradas. No depende de jornadas de personal.
- Las rutas usan `scope=game`, sin fecha de catálogo. El panel no presenta estadísticas.
- La migración `20261031170000_persistent_game_catalog` consolida cantidades pendientes anteriores por premio y conserva indefinidas las cantidades que requieren revisión. Preserva premios, lotes, tokens e historial de emisiones; la fecha de preparación histórica queda en su evidencia JSON inmutable.
- Los registros preparados están protegidos frente a la limpieza de premios huérfanos.

Verificación: tipos y comprobaciones aisladas de creación, emisión y migración mediante PostgreSQL en memoria. Sin E2E ni borrados sobre la base de negocio.

## Presentación del panel

- «Premios del sistema» aparece antes de «Crear nuevo premio». Su acción es «Preparar premios del sistema».
- El catálogo muestra nombre y stock como texto, sin indicador de color ni edición directa de cantidades. Solo ofrece Editar y Eliminar; Editar carga el formulario superior y desplaza la pantalla hasta él. La eliminación conserva las restricciones de uso existentes.
- «Lotes recientes» consulta los últimos siete lotes. Cada uno muestra nombre, creación, vigencia y cantidad, con Ver lote y Descargar QR. «Ver todos los lotes» abre `/admin/roulettebatches`; esta vista resumida no incorpora paginación interna ni estadísticas.

## QR del premio revelado

Ruleta y raspa y gana muestran un QR de canje en el modal final y en el panel persistente, exclusivamente para resultados entregables. El QR usa el enlace del token activo, también después de un reintento; no se crea otro premio. La lectura abre el flujo existente y la entrega conserva las comprobaciones del servidor de vigencia, estado y responsable. Los estados de vencimiento, deshabilitación y entrega conservan sus pantallas existentes.

`PrizeRedemptionQr` genera la imagen localmente con la biblioteca instalada, sin servicios externos. Mantiene contraste negro/blanco, margen de lectura y ancho flexible hasta 224 px; el modal tiene altura máxima según el viewport dinámico y desplazamiento vertical para móviles pequeños. Si falla la generación, ofrece el enlace del premio. El cliente puede conservar una captura sin extender su vigencia. El panel no muestra un botón para copiar el enlace del premio.
