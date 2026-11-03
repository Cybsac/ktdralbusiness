# Evaluación diaria

Las pantallas `/u/daily-evaluation` y `/admin/daily-evaluation` consultan las mismas API de `/api/admin/daily-evaluation`. El cierre reúne la calificación global, un comentario obligatorio y una calificación individual para cada persona evaluable. Se consideran evaluables las personas activas con una marca IN durante la jornada y un usuario con rol COLLAB o STAFF. La asistencia completa se sigue mostrando aunque una persona no cumpla esos criterios.

## Fecha y permisos

El servidor calcula la jornada vigente en Lima con `ATTENDANCE_CUTOFF_HOUR` (10 por defecto), mediante `src/lib/attendanceDay.ts`; la pantalla obtiene esa fecha de la API. El cierre no admite jornadas futuras ni fechas calendario inválidas. ADMIN y COORDINATOR pueden cerrar; solo ADMIN puede reabrir. Solo ADMIN y COORDINATOR pueden consultar asistencia individual y calificaciones del equipo; los demás roles conservan acceso a los indicadores operativos permitidos, sin recibir esos datos individuales. El enlace a los QR respeta la misma política de acceso que el portal de QR.

## Cierre, ajustes y reapertura

El cierre valida los datos y guarda las calificaciones y el estado de la jornada en una transacción. Una jornada ya cerrada rechaza otro cierre. Si una persona evaluable no tiene una marca OUT en la jornada, su calificación baja un nivel, con mínimo MALO, y se añade la nota automática. El ajuste queda registrado en `originalRating`, `adjustmentReason` y `adjustedAt`, y no se vuelve a aplicar después de reabrir. Se conserva también la nota visible incluso si se edita el comentario individual. Al reabrir se limpia la evaluación global y las calificaciones individuales permanecen para revisión. Los cierres y reaperturas nuevos guardan en EventLog la persona responsable y los datos globales anteriores, en la misma transacción; los eventos históricos previos no pueden reconstruirse. En un error de conexión al cerrar, hay que consultar el estado antes de reintentar.

El rendimiento personal y del equipo usa el mismo cálculo y considera calificaciones de jornadas cerradas. El perfil muestra períodos basados en la jornada vigente y el equipo permite elegir las fechas. Al reabrir una jornada, sus calificaciones se conservan para revisión y dejan de contarse hasta que vuelva a cerrarse. El promedio del equipo se calcula sobre las calificaciones individuales, no sobre la cantidad de fechas. La falta de salida afecta a la calificación de esa jornada; no resta puntos a los hitos acumulados.

El saldo acumulado suma los puntos de todas las jornadas individuales cerradas (MALO 1, REGULAR 2, BUENO 3, MUY_BUENO 4) y los puntos de hitos vigentes. Se calcula desde los datos existentes, incluyendo el histórico, sin crear créditos duplicados: al reabrir una jornada deja de contarse hasta el nuevo cierre; una corrección se refleja en el resultado. Las calificaciones inválidas o sin jornada cerrada no se suman. El desglose mantiene separadas las jornadas y los hitos; el promedio de calificaciones sigue siendo una medida distinta del saldo.

En rendimiento del equipo se puede consultar una jornada o un rango inclusivo de fechas de jornada. Los puntos de jornadas se limitan a la selección; el saldo acumulado no cambia con el filtro. La API valida fechas reales y rechaza rangos invertidos, y por defecto consulta la jornada vigente.

Las novedades de jornada son los comentarios generales de evaluaciones cerradas. `/u/journey-updates` permite a administración y coordinación consultar el historial por fecha, con acceso a cada jornada y los nombres disponibles de quien registró la evaluación y quien la cerró. No se infiere el autor de cada hecho narrado. Evolución cuenta jornadas con comentario y ya no atribuye incidencias a personas mediante coincidencias de texto.

Las calificaciones individuales usan Regular como valor inicial en el formulario; la pantalla de resultados únicamente muestra calificaciones guardadas. Los cierres antiguos sin evaluación global pueden completarse desde administración mientras permanezcan cerrados y sin evaluación: la actualización verifica ambas condiciones en la misma operación. La fecha y hora del cierre se muestran en la zona de Lima.

La migración `20261101180000_daily_rating_adjustment` identifica los ajustes históricos a partir de la nota ya existente y registra su motivo. Como la nota no conserva la calificación original ni la hora exacta, esos campos quedan vacíos para esos registros históricos. La nota no se modifica. Para ajustes nuevos se guardan los tres datos estructurados.

## Organización del resumen

La ruta conserva el contrato público y delega en `src/lib/daily-evaluation-summary/` los cálculos de asistencia, premios de ruleta, invitados y cumpleaños, reutilizables y lotes estáticos. Las consultas independientes se ejecutan en paralelo y comparten una misma ventana horaria calculada en el servidor.

## Métricas

Las entregas, revelaciones y uso de reutilizables se cuentan dentro de la ventana de la jornada; cumpleaños y eventos usan el día calendario de Lima. Los lotes estáticos disponibles se calculan para el corte de la jornada consultada, pero la cifra de tokens estáticos en circulación es una instantánea del momento actual incluso al consultar una jornada pasada. El cierre conserva la evaluación, pero los indicadores del resumen siguen consultándose en vivo y pueden cambiar después del cierre; la pantalla lo indica expresamente. Las vistas diaria y semanal comparten los cálculos de asistencia, pulseras, cumpleaños, invitados y QR reutilizables.

El avance de pulseras compara las entregas acumuladas hasta el corte con el total de los lotes programados para la fecha seleccionada. La tarjeta de entregas de la jornada, en cambio, incluye las entregas realizadas durante esa jornada, incluso si pertenecen a lotes de otra fecha; por eso ambas cifras pueden diferir.

## Verificación

Ejecutar `npx vitest run src/test/daily-evaluation-summary.test.ts src/test/daily-evaluation.test.ts src/test/attendanceDay.test.ts` y `npm run typecheck`. Probar adicionalmente con usuarios y datos aislados el cierre desde ambas pantallas, la reapertura por ADMIN y el cambio rápido de fecha; no usar jornadas reales como datos de prueba.

## Tokens interactivos

Las tarjetas usan el lote estático con fecha funcional más reciente no posterior a la jornada seleccionada; en caso de empate se elige el más reciente. Disponibles son tokens vigentes y habilitados que no se han escaneado; en circulación son los escaneados pendientes de entrega; entregados en la jornada cuenta las entregas de esa ventana. La barra muestra las entregas acumuladas sobre el total del lote. Los tokens pendientes vencidos, deshabilitados o que aún no están vigentes se muestran como no disponibles. Para hoy el corte es el momento de la consulta; para una jornada pasada es su fin.

El sistema no guarda el historial de habilitación de los tokens: al consultar fechas pasadas se utiliza el estado de habilitación actual. El inventario del lote se considera disponible desde su fecha funcional, aunque se haya creado después del inicio horario de esa jornada.

## QR reutilizables por grupo

Las tarjetas separan los usos registrados durante la jornada de los QR disponibles y usos restantes en el momento de la consulta. La disponibilidad usa las mismas reglas de canje: premio activo, token habilitado, sin vencer, con saldo y dentro de su horario; los grupos bloqueados no se consideran disponibles. Los grupos bloqueados o eliminados conservan su actividad cuando existen eventos para la fecha. Los tokens sin grupo se muestran aparte y no aparecen en la lista por grupos del portal.

Desde esta version, cada uso registra en la nota estructurada del evento el identificador y nombre del grupo y del premio en el momento del canje. Los eventos anteriores no se modifican: cuando carecen de esos datos, la vista usa la asignacion actual y la marca como estimada. La diferencia entre el contador acumulado y los eventos existentes se presenta como usos sin historial detallado y no se distribuye entre fechas. Los indicadores se actualizan al recuperar el foco y periodicamente, sin reiniciar los formularios de cierre.

La fecha de jornada vigente se actualiza al recuperar el foco y periódicamente sin cambiar la fecha elegida ni borrar formularios. Las solicitudes de actividad y de historial descartan respuestas que correspondan a una selección anterior.

## Actividad por colaborador

La sección atribuye a cada usuario únicamente las operaciones registradas con su identificador dentro de la ventana de la jornada: canjes y entregas de QR reutilizables por grupo, entregas de pulseras TokenShow y tokens interactivos, y llegadas de cumpleaños. Las llegadas se muestran por separado y no se consideran ventas al ordenar la actividad. Un escaneo público o un registro sin responsable identificable no se atribuye a un colaborador. La información es actividad registrada, no una medición de ingresos ni una prueba de venta.

Los usuarios consultan su propio detalle; coordinación consulta su equipo, excluidos administradores; administración consulta todos y puede filtrar por área y rol. Tanto la lista como el historial aplican esa regla. El historial reutilizable usa la fotografía del grupo y premio del evento cuando existe y, para eventos antiguos sin fotografía, la asignación actual. Las cifras se actualizan periódicamente, al recuperar el foco y después de una entrega reutilizable desde el panel.

## Hitos acumulados

Los hitos reconocen operaciones históricas y nuevas de reutilizables, pulseras y tokens interactivos con responsable asociado a una cuenta existente. No incluyen llegadas de cumpleaños ni operaciones sin responsable identificable. El progreso es acumulativo entre jornadas y es independiente de la calificación manual. La migración importa el historial disponible en una transacción e instala disparadores que registran nuevas operaciones en el mismo momento en que se guardan, sin depender de abrir la pantalla. El registro queda independiente del token de origen y conserva el avance si ese token se elimina. Si una entrega se revierte, el crédito y los puntos que dejen de corresponder quedan suspendidos; si se vuelve a alcanzar el hito, se recupera el mismo reconocimiento sin duplicarlo.

Administración puede agregar hitos, activarlos, desactivarlos y cambiar sus puntos. Los puntos de reconocimientos ya concedidos se conservan; al crear o activar un hito se otorga también a quienes ya lo hayan alcanzado. El perfil muestra el siguiente hito, los puntos y los reconocimientos; administración y coordinación pueden consultar el acumulado de su equipo, también desde rendimiento del equipo. El promedio pertenece al período seleccionado, mientras que los hitos y sus puntos son acumulados y no se suman al promedio. La migración `20261102120000_activity_milestones` debe aplicarse antes de usar esta función; bloquea brevemente las tablas de operaciones durante la importación para evitar que se pierdan eventos concurrentes.
