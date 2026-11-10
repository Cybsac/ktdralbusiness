# Vigencia de QR reutilizables

La modalidad por fecha guarda un inicio y un fin absolutos en la zona horaria configurada. Las ventanas diarias anteriores siguen siendo recurrentes. El inicio se valida tanto al consultar disponibilidad como al canjear.

En desarrollo, la generación de QR con fecha programada está deshabilitada por defecto para evitar crearlos en una base compartida con producción cuando la aplicación publicada todavía no comprueba el inicio. Solo en una base aislada, o después de desplegar la versión que valida `validFrom` en todas las instancias, se puede habilitar con `REUSABLE_SCHEDULED_LOCAL_ENABLED=1`. La generación en producción queda habilitada al desplegar el código actualizado.
