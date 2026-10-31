# Navegación administrativa

## Catálogo y vistas

`src/components/admin/navigation/catalog.ts` es el catálogo compartido por
`AdminSidebar` y `AdminMobilePanel`, conservando visibilidad por basePath y rol.
Los grupos tienen identificadores estables; los títulos ya no gobiernan el estado.
Asistencia y acceso de escáner conservan su presentación especial en móvil.
Los iconos se definen una sola vez en `icons.tsx`.

`matching.ts` elige una sola ruta activa, priorizando límites de segmento y la
ruta más profunda, y distinguiendo parámetros de pestañas. Los parámetros
ajenos al menú no alteran la selección. Los placeholders # no navegan.

`useNavigationExpansion.ts` conserva grupos abiertos en sessionStorage por
ámbito. Si storage no está disponible, el menú sigue funcionando en memoria.
La ruta activa se abre al navegar; cerrar manualmente un grupo no se deshace
por un render. Pulsar un grupo en modo compacto expande el sidebar y abre ese
grupo, incluso si ya estaba abierto antes de contraer.

## Scroll y layout

La navegación tiene un único scroll interno y altura flexible; cabecera y pie
no se comprimen. Al cambiar de ruta solo se desplaza si el enlace activo queda
fuera de la vista. No se reescribe scrollTop en cada render.
El breakpoint móvil usa matchMedia y no sobrescribe la preferencia de contraer
al redimensionar. La preferencia se guarda por pestaña y ámbito.

Se retiraron la fecha falsa de última actualización y versión fija del pie,
el catálogo duplicado, listeners/estado de asistencia móvil sin uso, una función
de logout móvil sin uso y ramas para nombres de categorías inexistentes.
No se cambiaron permisos de APIs ni endpoints de cierre de sesión existentes.

## Validación

`tests/admin-navigation/matching.test.ts`: 14 casos sin base de datos (pestañas,
rutas profundas, límites de prefijo, roles, IDs únicos y paridad de destinos).
Prueba visual aislada con los componentes reales, router/enlaces y asistencia
simulados: apertura/cierre, modo compacto, una sola pestaña activa, restauración
tras recarga, scroll interno y menú móvil de 320 px sin overflow horizontal.
La prueba no registra asistencia, no abre herramientas de borrado ni cambia datos.

## Orden por operación

`categories.ts` centraliza la clasificación y el orden para /admin en escritorio
 y móvil: operación interna, operación comercial, web pública y otros. Los módulos no
clasificados conservan su orden relativo al final. No cambia la navegación /u,
los IDs, permisos, destinos ni el estado de desplegables.
`NavigationCategoryDivider` comparte los rótulos discretos y separadores; en modo
compacto el texto queda accesible y la separación es visual. Las pestañas móviles
Purge y Upgrade mantienen su presentación sin añadir encabezados operativos.

Web pública reúne gestión de ofertas, gestión de shows, contenido visual y venta
de tickets, funciones de la landing/home pública.
