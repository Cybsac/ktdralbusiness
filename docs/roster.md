# Rol de la jornada

`/u/roster` y `/admin/roster` comparten el módulo y la API. Los usuarios activos pueden consultar el equipo asignado; solo ADMIN y COORDINATOR pueden buscar colaboradores, modificar asignaciones o gestionar funciones. Los permisos se verifican en el servidor con el usuario vigente.

La jornada predeterminada usa `currentBusinessDay()` y el corte configurado por `ATTENDANCE_CUTOFF_HOUR`. Las fechas seleccionadas son jornadas, no marcas de asistencia. La asignación no altera áreas, cargos, permisos ni marcas de asistencia del colaborador.

Las funciones se almacenan en `RosterRole`. La migración inicial incorpora las áreas existentes como datos iniciales; después pueden agregarse, renombrarse, desactivarse y reactivarse desde el módulo. Desactivar una función impide nuevas asignaciones y conserva las existentes. Los nombres equivalentes por mayúsculas y acentos no se duplican.

`RosterAssignment` identifica cada combinación de jornada, persona y función. Retirar una asignación la desactiva; restaurarla reutiliza el mismo registro. Cada cambio efectivo añade un `RosterEvent` con operador y nombres al momento del cambio. La pantalla muestra los 50 cambios más recientes de la jornada; el resto permanece almacenado. Las modificaciones de funciones también se registran en la auditoría general.

La vista de `/u` está enfocada en asignar y consultar personal; la gestión de funciones y el historial se muestran en `/admin`. Ambas vistas guardan las asignaciones al seleccionar o retirar una persona.

## Asistencia y llegadas no programadas

El informe de `/admin/attendance` combina las asignaciones activas, las marcas IN/OUT y las tareas por persona y jornada. Varias funciones de una persona en la misma jornada cuentan como una programación. El rol de `/u` muestra a administración y coordinación el estado de las marcas de los asignados.

Una persona programada sin entrada aparece pendiente durante la jornada y como «falta · sin entrada» al cerrarse. Se considera cerrada por el cierre de evaluación o por el corte de la jornada siguiente. Una entrada cuya última marca sigue siendo IN aparece como jornada incompleta al cierre. La última marca determina si sigue dentro; una salida anterior no cierra una entrada posterior. La falta de programación histórica significa que no se registró el rol en la aplicación, no que la persona asistió indebidamente.

Administración y coordinación pueden comentar y justificar una salida no marcada, o revocar esa justificación dejando un motivo. El historial registra cada cambio y su autor. La justificación se vincula a la última entrada para que no se aplique a una marca posterior distinta. Por decisión operativa, la jornada justificada sigue contando como incompleta y no se generan marcas ni se cambian calificaciones. El ajuste automático de calificación existente en la evaluación de jornada sigue funcionando de forma independiente.

Las marcas de personas sin programación se conservan y se muestran. Administración o coordinación puede indicar un motivo libre, por ejemplo pasantía o entrenamiento, sobre una persona registrada que ya tenga marcas. El motivo no crea marcas ni asignaciones. Las personas nuevas deben registrarse primero como colaboradores. No se bloquean marcas solo por faltar programación.

Los indicadores de jornadas cerradas sin entrada se basan únicamente en personas programadas, no en todos los colaboradores activos. Las marcas históricas y las asignaciones se mantienen sin modificaciones ni limpiezas.

La búsqueda de personal devuelve resultados limitados y sugiere primero la coincidencia con el área de la función. Solo incluye personas activas con usuario. La vista de consulta de colaboradores devuelve únicamente asignaciones y funciones, sin la lista completa de personas ni datos de DNI, teléfono o fecha de nacimiento.

Las migraciones son aditivas y se despliegan con `prisma migrate deploy`. Las pruebas automatizadas simulan el almacenamiento; no vacían tablas ni crean asignaciones reales.
