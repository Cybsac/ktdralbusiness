# Evaluación diaria

Las pantallas `/u/daily-evaluation` y `/admin/daily-evaluation` consultan las mismas API de `/api/admin/daily-evaluation`. El cierre reúne la calificación global, un comentario obligatorio y una calificación individual para cada persona evaluable. Se consideran evaluables las personas activas con una marca IN durante la jornada y un usuario con rol COLLAB o STAFF. La asistencia completa se sigue mostrando aunque una persona no cumpla esos criterios.

## Fecha y permisos

El servidor calcula la jornada vigente en Lima con `ATTENDANCE_CUTOFF_HOUR` (10 por defecto), mediante `src/lib/attendanceDay.ts`; la pantalla obtiene esa fecha de la API. El cierre no admite jornadas futuras ni fechas calendario inválidas. ADMIN y COORDINATOR pueden cerrar; solo ADMIN puede reabrir. Los roles admitidos por las API pueden consultar los datos, de acuerdo con la autorización ya existente.

## Cierre, ajustes y reapertura

El cierre valida los datos y guarda las calificaciones y el estado de la jornada en una transacción. Una jornada ya cerrada rechaza otro cierre. Si una persona evaluable no tiene una marca OUT en la jornada, su calificación baja un nivel, con mínimo MALO, y se añade la nota automática. El ajuste queda registrado en `originalRating`, `adjustmentReason` y `adjustedAt`, y no se vuelve a aplicar después de reabrir. Se conserva también la nota visible incluso si se edita el comentario individual. Al reabrir se borra la evaluación global, mientras las calificaciones individuales permanecen para revisión. En un error de conexión al cerrar, hay que consultar el estado antes de reintentar.

La migración `20261101180000_daily_rating_adjustment` identifica los ajustes históricos a partir de la nota ya existente y registra su motivo. Como la nota no conserva la calificación original ni la hora exacta, esos campos quedan vacíos para esos registros históricos. La nota no se modifica. Para ajustes nuevos se guardan los tres datos estructurados.

## Organización del resumen

La ruta conserva el contrato público y delega en `src/lib/daily-evaluation-summary/` los cálculos de asistencia, premios de ruleta, invitados y cumpleaños, reutilizables y lotes estáticos. Las consultas independientes se ejecutan en paralelo y comparten una misma ventana horaria calculada en el servidor.

## Métricas

Las entregas, revelaciones y uso de reutilizables se cuentan dentro de la ventana de la jornada; cumpleaños y eventos usan el día calendario de Lima. Los lotes estáticos disponibles se calculan para el corte de la jornada consultada, pero la cifra de tokens estáticos en circulación es una instantánea del momento actual incluso al consultar una jornada pasada. Los grupos reutilizables reflejan los grupos actualmente desbloqueados. Estas definiciones se mantienen para preservar los resultados existentes.

## Verificación

Ejecutar `npx vitest run src/test/daily-evaluation-summary.test.ts src/test/daily-evaluation.test.ts src/test/attendanceDay.test.ts` y `npm run typecheck`. Probar adicionalmente con usuarios y datos aislados el cierre desde ambas pantallas, la reapertura por ADMIN y el cambio rápido de fecha; no usar jornadas reales como datos de prueba.

## Tokens interactivos

Las tarjetas usan el lote estático con fecha funcional más reciente no posterior a la jornada seleccionada; en caso de empate se elige el más reciente. Disponibles son tokens vigentes y habilitados que no se han escaneado; en circulación son los escaneados pendientes de entrega; entregados en la jornada cuenta las entregas de esa ventana. La barra muestra las entregas acumuladas sobre el total del lote. Los tokens pendientes vencidos, deshabilitados o que aún no están vigentes se muestran como no disponibles. Para hoy el corte es el momento de la consulta; para una jornada pasada es su fin.

El sistema no guarda el historial de habilitación de los tokens: al consultar fechas pasadas se utiliza el estado de habilitación actual. El inventario del lote se considera disponible desde su fecha funcional, aunque se haya creado después del inicio horario de esa jornada.
