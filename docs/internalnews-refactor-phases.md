# Comunicados internos: refactor por fases

## Fases 1 y 2 implementadas — 30 de octubre de 2026

### Comportamiento

| Asignación | Entrada automática | Bandeja | Finalización |
| --- | --- | --- | --- |
| Obligatoria, sin trivia | Sí | Sí | Aceptación del titular |
| Obligatoria, con trivia | Sí | Sí | Todas las respuestas correctas, verificadas en servidor |
| Opcional, sin trivia | No | Sí | Apertura y registro de lectura |
| Opcional, con trivia | No | Sí | Apertura voluntaria del modal y respuestas correctas |

El reglamento base mantiene su flujo independiente. No se añade un bloqueo global
de todas las API por comunicados pendientes.

### Fase 1: integridad y trazabilidad

- Las eliminaciones de comunicados pasan a archivar, conservando asignaciones.
- Cancelar una asignación pendiente conserva el registro como SKIPPED. No se
  permite cancelar una asignación completada.
- La aceptación exige propiedad, estado pendiente y, cuando corresponde,
  respuestas correctas. Repetir una aceptación no altera su fecha original.
- La evidencia de aceptación se guarda en la misma transacción: titular,
  asignación, comunicado, modalidad, respuestas y huella del HTML.
- No se admiten versiones futuras del reglamento base.
- El HTML se sanitiza al guardar y al entregar contenido existente.
- En fases 1/2, el contenido con historial se bloqueaba para edición. La fase 3
  sustituye ese bloqueo para asignaciones internas con revisión. Archivar no
  cancela lo ya asignado.

### Fase 2: servicios y contratos compartidos

- Servicios en `src/lib/internal-news` para contenido, asignaciones, aceptación,
  autorización, validación y respuestas de error. Las rutas antiguas de preguntas
  delegan en esos mismos servicios; no mantienen escrituras paralelas.
- Roles centralizados: contenido ADMIN/COORDINATOR/STAFF; asignación
  ADMIN/COORDINATOR. La página y las API verifican sesión y permisos.
- Destinatarios activos mediante un endpoint específico con datos mínimos.
  El listado de asignaciones no expone el objeto completo de usuario.
- Asignación transaccional serializable con reintentos de conflictos; omite
  asignaciones pendientes o completadas existentes y devuelve cantidades reales.
  No elimina duplicados históricos. Una asignación cancelada puede reasignarse.
- Listado administrativo paginado; áreas y límites centralizados.
- Se guardan correctamente los puntos de las preguntas, incluido cero.
- La cola automática contiene únicamente obligatorios. La bandeja abre trivia
  opcional bajo demanda; no se entregan banderas de respuestas correctas.
- Se eliminó la consulta individual de conteos por comunicado y se sincronizan
  los datos del administrador mediante actualización de la vista.

### Validación y datos

Pruebas de servicios y handlers con repositorios simulados en memoria, más
regresión aislada de premios, OTP, sockets, navegación y lotes estáticos.
Comprobación de tipos y revisión de lint del alcance modificado.
No se ejecutaron resets, semillas, migraciones ni pruebas que creen, asignen,
acepten o borren registros en la base real.

### Fase 3 implementada — 30 de octubre de 2026

- `InternalNewsRevision` conserva una copia completa e inmutable de texto,
  título, descripción, preguntas, orden, puntos y respuestas. Cada asignación
  referencia su revisión; lectura, bandeja y corrección de trivia usan esa copia.
- Editar un comunicado interno o sus preguntas aumenta la versión del borrador.
  La siguiente asignación captura esa versión. Reasignar la misma revisión no
  duplica destinatarios pendientes/completados; una revisión nueva puede enviarse
  a personas que recibieron la anterior. Las asignaciones anteriores se conservan.
- El botón **Revisiones** permite consultar contenido histórico y cantidades
  asignadas mediante una API autorizada y paginada.
- Los disparadores de PostgreSQL impiden modificar/borrar revisiones o cambiar
  el titular, modalidad y referencia de una asignación con revisión. Estado y
  fecha de finalización siguen su flujo de aceptación/cancelación.
- `audience` separa INTERNAL de PUBLIC. El administrador de comunicados trabaja
  con INTERNAL; el catálogo y las sesiones públicas rechazan contenido interno,
  incluido el acceso por identificador de una sesión antigua.
- La migración clasifica como internos los conjuntos con HTML de comunicado o
  asignaciones. Los demás conservan audiencia pública. En la base conectada, los
  28 conjuntos existentes cumplieron el criterio interno.
- El editor compartido usa Tiptap y no depende de `execCommand`, manipulación de
  selección DOM ni dos barras de herramientas duplicadas. Mantiene formato,
  listas, enlaces, emojis y deshacer/rehacer. Los enlaces admiten HTTP/HTTPS/mailto;
  la sanitización del servidor sigue siendo obligatoria.
- `InternalNewsClient` coordina la pantalla administrativa; `NewsEditor`,
  `NewsRevisionHistory` y los formularios mantienen responsabilidades separadas.
- `NewsContentFields` y `NewsQuestionFields` sirven tanto para crear como editar.
  La validación de preguntas reutiliza el contrato del servidor; los límites de
  respuestas se centralizan en NEWS_POLICY.
- Las métricas se calculan sobre asignaciones internas y aceptaciones, no sobre
  sesiones de trivia pública. La tasa excluye asignaciones canceladas.
- La bandeja tiene páginas acotadas, contador global de pendientes y carga de más
  resultados. `useInternalNewsInbox` centraliza carga, cancelación de consultas,
  actualización tras completar y registro de lectura opcional.
- Completar el modal actualiza la bandeja sin recargar toda la página. La consulta
  periódica de obligatorios sigue operando después de cerrar/completar el modal.

### Migración aplicada y verificación

Se aplicó únicamente `20261030180000_internal_news_revisions`, después de guardar
una copia previa y validar el SQL en PostgreSQL aislado en memoria (PGlite).
La comparación posterior confirmó 28 conjuntos y 345 asignaciones conservadas,
con cero cambios en sus campos anteriores; quedaron 28 revisiones iniciales y
cero asignaciones sin revisión. No se probaron escrituras de negocio en la base
real: no se crearon comunicados/asignaciones/aceptaciones de prueba.

El respaldo inicial captura el contenido existente al migrar. No reconstruye
ediciones históricas que el sistema anterior no registró. Los conjuntos con
sesiones públicas previas mantienen la protección de edición para no alterar
sus referencias; se debe crear un comunicado nuevo en ese caso.

Validación final: 186 pruebas aisladas aprobadas, tipos y lint del alcance sin
errores. Verificación visual del editor real en una vista aislada, sin conexión
al repositorio de datos: formato, enlaces válidos/inválidos, conservación al
editar otro campo, emojis y ancho de 320 píxeles. No sustituye una aceptación
real ni un recorrido autenticado de todos los roles.

La auditoría original se conserva en `internalnews-audit.md` como diagnóstico
previo a estas correcciones.
