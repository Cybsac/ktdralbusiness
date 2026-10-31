# Auditoría de /admin/internalnews

Estado: diagnóstico previo. Las correcciones de las tres fases se
detallan en [internalnews-refactor-phases.md](internalnews-refactor-phases.md).

Fecha: 30 de octubre de 2026. Alcance: revisión estática del flujo completo, sin
crear sesiones, asignar comunicados, aceptar lecturas ni borrar datos. No equivale
a una prueba E2E funcional contra la base de datos real.

## Flujo encontrado

1. `admin/internalnews/page.tsx` carga sets, preguntas, respuestas y estadísticas.
2. `TriviaClient.tsx` crea/edita/elimina contenido con `/api/trivia/question-sets`
   y `/api/trivia/questions`, y asigna por `/api/admin/trivia/assign`.
3. Las asignaciones se guardan en CommitmentAssignment, relacionadas a
   TriviaQuestionSet. Este contenido también participa del sistema de trivia pública.
4. `/u/layout.tsx` monta CommitmentModal. El modal consulta
   `/api/user/commitment/pending`, muestra contenido y evalúa las respuestas en cliente.
5. `/api/user/commitment/accept` completa la asignación. La bandeja de Novedades usa
   `/api/user/commitment/inbox` y `/api/user/commitment/inbox/read`.

## Prioridad alta

### 1. Borrado destruye trazabilidad de comunicados

`api/trivia/question-sets/[id]/route.ts`, DELETE, elimina todas las asignaciones
relacionadas con deleteMany, incluidas COMPLETED, antes de borrar el set.
Solo comprueba sesiones públicas de trivia incompletas; no protege aceptaciones
internas completadas. Las escrituras de borrado no están agrupadas en transacción.
Si falla una dependencia después, pueden haberse borrado ya las asignaciones.
El DELETE individual de asignación sí protege COMPLETED, por lo que las reglas
son contradictorias.

Propuesta: archivar contenido/asignaciones, proteger evidencias completadas y
usar un servicio transaccional con una política única para cualquier eliminación.
No realizar limpieza de históricos como parte del refactor.

### 2. Cumplimiento y trivia no son autoritativos en servidor

CommitmentModal calcula allCorrect y recibe respuestas con isCorrect desde pending.
accept recibe version, assignmentId y acceptOnly, pero no valida respuestas,
includeTrivia, estado PENDING ni revisión del comunicado antes de completar.
Sí condiciona la actualización por userId, lo que conserva la propiedad del registro.
La ruta inbox/read puede completar un no-obligatorio con includeTrivia=true sin
pasar por un examen. La lectura obligatoria se presenta como guard de interfaz;
no se encontró una política equivalente de bloqueo general en middleware.
La aceptación del reglamento admite versiones futuras (solo rechaza versiones
menores), lo que puede adelantar la aceptación de futuras revisiones.

Propuesta: transiciones de estado idempotentes verificadas en servidor, separar
aceptación de reglamento y de comunicado, resolver la revisión en servidor y evaluar
trivia allí si se exige como condición de cumplimiento.

### 3. No queda evidencia inmutable del contenido aceptado

CommitmentAssignment apunta al set mutable; no almacena snapshot ni revisión del
contenido y preguntas. requiredVersion existe pero la asignación no lo configura
según una revisión de noticia. Editar el set cambia lo mostrado en relecturas de
asignaciones ya completadas.

Propuesta: revisiones/snapshots por nueva asignación, sin reescribir aceptaciones
históricas. Definir si una revisión nueva requiere una nueva asignación.

### 4. Asignaciones duplicables y validación incompleta

assign usa createMany(skipDuplicates:true), pero CommitmentAssignment no tiene
constraint única adecuada para evitar repetir la misma entrega. El propio
comentario del endpoint reconoce que skipDuplicates no cubre este caso.
Faltan esquema compartido, verificación explícita del set activo, de usuarios
activos al enviar IDs concretos, normalización/deduplicación uniforme y validación
de includeTrivia cuando no hay preguntas activas. assignToAll con cero activos
puede devolver éxito con cero destinatarios.

Propuesta: definir identidad de envío/revisión, idempotencia y política de reenvío,
validar todos los destinos y devolver conteos reales. Migración aditiva si se añade
constraint; no borrar ni consolidar filas históricas automáticamente.

### 5. HTML sin sanitización y editor heredado

Se guarda regulationContent como string y se renderiza con dangerouslySetInnerHTML
en CommitmentModal y UHomeContent. No se encontró saneamiento del HTML en las rutas
de creación/edición ni en estas salidas. El editor usa document.execCommand e
innerHTML y duplica las barras y ventanas de crear/editar.

Propuesta: editor compartido mantenido, límites de contenido y saneamiento por
lista permitida de etiquetas, atributos y protocolos. Conservar el formato válido
existente; no interpretar esta revisión como autorización para modificar HTML real.

## Prioridad media

### 6. Puntos editados no se guardan por el endpoint usado

TriviaClient envía pointsForCorrect/pointsForIncorrect a PUT /api/trivia/questions/:id.
El esquema y la actualización de esa ruta no incluyen ambos campos. Otra
implementación dentro de /api/trivia/questions sí los maneja, pero no es la ruta
utilizada por ese formulario. Además, el formulario usa pointsForCorrect || 10,
convirtiendo un cero válido en diez al editar.

Propuesta: un esquema y servicio por operación, pruebas de ida y vuelta incluyendo
cero, y usar valores por defecto solo ante null/undefined.

### 7. APIs duplicadas y permisos inconsistentes

Hay CRUD repetido en rutas de colección y detalle, y en /api/admin/trivia/questions.
Los cambios no están sincronizados. El helper de contenido permite ADMIN,
COORDINATOR y STAFF; asignar y borrar asignaciones permite solo ADMIN. Debe definirse
la matriz de roles. No es un fallo de dos cookies diferentes: los nombres legacy
de autenticación son alias de user_session en lib/auth.ts.

GET assign incluye user completo con person. Prisma devuelve los campos escalares
del usuario, incluido passwordHash, aunque la tabla solo necesita nombre/área.
Propuesta: permisos explícitos compartidos y DTO/select mínimo de usuario.

### 8. Confusión entre contenido público e interno

El menú dice Noticias, pero metadata/títulos hablan de Trivia y trivia pública.
Los sets internos y el catálogo público usan TriviaQuestionSet y el catálogo
público selecciona todos los activos. No hay discriminador de audiencia en el modelo.
No se probó la exposición con datos reales; la separación ausente se observa en
las consultas y contratos.

Propuesta: visibilidad explícita interno/público, sin eliminar el motor público ni
cambiar asignaciones existentes a ciegas. El contenido para empleados no debe
publicarse solo por tener active=true.

### 9. Consultas y estadísticas no escalan ni reflejan bien este módulo

La página consulta todos los sets/preguntas/respuestas y sesiones. Hace un count
de sesiones por cada set (N+1). No hay paginación en asignaciones o inbox.
Los indicadores usan TriviaSession/TriviaProgress, pero el flujo de aceptación
interna actualiza CommitmentAssignment; no registra el examen del modal allí.
Por tanto no son métricas fiables de lectura o comprensión de comunicados.

Propuesta: counts/groupBy y paginación; distinguir métricas de comunicación interna
(asignados, pendientes, leídos, aceptados, trivia aprobada) y de trivia pública.

### 10. Frontend monolítico, errores silenciosos y contratos débiles

TriviaClient supera dos mil líneas con formularios, editor, asignaciones, tablas,
estadísticas y tipos repetidos. Hay arrays de usuarios any, catch vacíos, alert,
confirm y recargas completas para actualizar datos. Un fallo de asignación puede
no informar al usuario.

Propuesta: componentes de contenido, preguntas, asignaciones y métricas; hook de
lectura/mutaciones con errores visibles y refresh localizado; DTOs compartidos y
estados de carga separados por operación.

### 11. Hardcodes evitables

Áreas duplicadas en el selector cuando ya existe ALLOWED_AREAS en lib/areas.ts;
cuatro respuestas y valores de puntos repetidos en inicialización/reset;
textos y etiquetas de estado repetidos; lógica de HTML/emoji/enlaces repetida.
No todo número o color es un hardcode defectuoso: estilos y valores iniciales
pueden ser legítimos si están centralizados y concuerdan con la regla del servidor.

### 12. Pruebas heredadas no cubren el flujo actual

`tests/trivia-api.test.ts` hace POST de sesiones con body vacío, pero la API actual
requiere questionSetId. Usa fetch a rutas relativas y contempla crear sesiones.
No se ejecutó para evitar escrituras o supuestos de entorno. No se encontró una
suite específica que cubra asignación -> lectura -> examen -> aceptación -> historial.

## Propuesta de implementación

1. Proteger historial, validar aceptación/asignación y cerrar DTOs de usuarios.
2. Unificar reglas/servicios y pruebas con Prisma simulado; corregir puntos y permisos.
3. Versionar contenido y separar audiencia, mediante cambios aditivos y revisión de
   compatibilidad con las asignaciones existentes.
4. Sustituir editor y descomponer UI, con filtros, paginación y métricas adecuadas.
5. Verificación de roles, reenvíos, repetición de aceptación, errores de red y móviles
   en fixtures aislados. Nunca ejecutar reset, seed, purge ni pruebas contra datos reales.

Diagnóstico: requiere refactor gradual con preservación del historial, no una
reescritura ni un borrado de la base. En esta auditoría no se modificó código del módulo.
