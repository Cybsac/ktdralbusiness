# Vigencia de QR reutilizables

La modalidad por fecha guarda un inicio y un fin absolutos en la zona horaria configurada. Las ventanas diarias anteriores siguen siendo recurrentes. El inicio se valida tanto al consultar disponibilidad como al canjear.

La modalidad semanal guarda los días ISO seleccionados (lunes 1 a domingo 7), el horario y el vencimiento. Las ventanas que cruzan medianoche pertenecen al día en que comienzan. El límite de usos es compartido entre todas las ventanas. Los tokens anteriores tienen una lista vacía y conservan su comportamiento.

En desarrollo, la generación de QR con fecha programada o días semanales está deshabilitada por defecto para evitar crearlos en una base compartida con producción cuando la aplicación publicada todavía no comprueba sus reglas. Solo en una base aislada, o después de desplegar la versión correspondiente en todas las instancias, se puede habilitar con `REUSABLE_SCHEDULED_LOCAL_ENABLED=1`. La generación en producción queda habilitada al desplegar el código actualizado.
