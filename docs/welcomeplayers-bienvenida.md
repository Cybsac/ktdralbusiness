# Pantalla de bienvenida de Welcome Players

Administradores y coordinadores pueden cargar y activar o desactivar una imagen o un video desde sus vistas de Welcome Players. La pantalla pública muestra el contenido en vertical, sin sonido; al tocarla abre la ruleta sin iniciar un giro. Regresa tras 30 segundos sin interacción y permanece oculta durante el giro y mientras se muestra el premio. Si el archivo no carga, la ruleta sigue disponible.

Las imágenes JPG, PNG y WebP verticales se convierten a WebP de 1080 × 1920 sin recortar. Los videos MP4 y WebM se almacenan sin convertir; deben estar comprimidos y preparados para reproducirse en el navegador del tótem. El contenido se ajusta completo a la pantalla, con márgenes oscuros si las proporciones no coinciden. El diseño debe incluir la indicación de tocar para jugar; toda la pantalla responde al toque. Los límites son 10 MB para imágenes y 25 MB para videos. Se sobrescribe un archivo fijo por formato, por lo que como máximo se conservan tres archivos multimedia y la configuración; no se generan copias por cada carga.

La configuración y los archivos se almacenan bajo `welcomeplayers/attract/` en el bucket público `exchange-media`, que admite los tipos necesarios y tiene un límite de 30 MB. Para usar otro bucket público con soporte para imágenes, video y JSON, configurar `WELCOMEPLAYERS_MEDIA_BUCKET`. El tiempo de inactividad puede ajustarse en segundos con `NEXT_PUBLIC_WELCOMEPLAYERS_IDLE_SECONDS` (por defecto 30; es una variable de compilación del cliente). La pantalla comprueba periódicamente cambios de configuración. La carga requiere `SUPABASE_SERVICE_ROLE_KEY` en el servidor. No se crean ni modifican tablas.

Las imágenes pueden mostrarse estáticas o con efecto de rebote, latido o luces superpuestas. El efecto se configura en la pantalla de bienvenida de `/u/welcomeplayers` o `/admin/welcomeplayers` y no se aplica a los videos. El rebote y el latido mantienen la imagen completa dentro del área visible. Los efectos respetan la preferencia de movimiento reducido del dispositivo.

## Jornadas y resultados

Los giros y premios obtenidos se agrupan por la jornada operativa, usando el mismo corte horario que asistencia. Administración y coordinación pueden consultar otra jornada sin modificar la configuración de premios, que permanece vigente hasta que se edite manualmente. Los giros existentes se clasifican a partir de su fecha y hora, utilizando el corte configurado actualmente; si este cambia, también puede cambiar la jornada atribuida a registros anteriores.

El historial de giros se conserva y el antiguo reinicio del contador está deshabilitado. Los resultados indican premios obtenidos en la ruleta: no constituyen una confirmación independiente de entrega física.
