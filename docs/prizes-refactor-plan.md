# Plan de ejecución: premios, QR, ruleta y raspa y gana

Estado: fases 1–6 implementadas y verificadas en aislamiento. Pendiente operativo:
revisión de 30 tokens históricos futuros que ya estaban deshabilitados; se conserva su bloqueo.
Entrega de fases 4–6, compatibilidad y límites: [prizes-phases-4-6.md](prizes-phases-4-6.md).
Detalle y límites de la entrega: [prizes-phases-1-3.md](prizes-phases-1-3.md).
Base: [auditoría del flujo](prizes-flow-audit.md), 30/10/2026.

## Objetivo y reglas de ejecución

Conservar el recorrido que ya funciona y corregir su integridad, consistencia y
mantenimiento. El premio permanece preasignado al generar el token; la ruleta y
el raspa lo revelan. No convertir este refactor en un cambio del modelo de juego.

- Conservar QR impresos, IDs, enlaces, firmas históricas, lotes y entregas.
- Conservar autorización por sesión de operador y OTP personal en público, con
  identificación del responsable. Gestionar premios es un permiso diferente.
- No ejecutar reset, TRUNCATE, seed, limpiezas ni E2E sobre la base conectada.
- Las pruebas de escritura usarán repositorios simulados o PostgreSQL efímero
  aislado. La conexión de pruebas debe verificarse y rechazar la conexión real;
  no depender únicamente de NODE_ENV ni permitir overrides inseguros.
- Migraciones sólo cuando sean necesarias: aditivas, probadas en aislamiento,
  con copia previa, comprobación posterior y compatibilidad de despliegue.
- Cada fase entrega código operativo, pruebas pertinentes, documentación breve
  y retirada de las ramas que haya reemplazado. No acumular una segunda solución
  en paralelo. Los adaptadores de contratos antiguos sólo permanecen cuando haya
  consumidores identificados, con propósito y condición de retirada documentados.
- No cambiar políticas comerciales durante una limpieza técnica. Antes de
  modificar desactivación, cierre del juego o continuidad sin premio disponible,
  fijar el comportamiento deseado. Las mejoras independientes pueden continuar.

## Fase 1 — Contratos y red de protección

### Trabajo

1. Inventariar consumidores de /api/prizes, generación, descarga, datos públicos,
   reveal, deliver, redeem y sesiones de ruleta por lote. Distinguir esos dos
   recorridos de ruleta; no eliminar el de sesiones porque se parezca al público.
2. Documentar estados existentes y sus combinaciones, sin normalizar datos reales
   automáticamente: disponible, programado, reservado, revelado, entregado,
   expirado y deshabilitado. RETRY y LOSE son resultados, no premios físicos.
3. Registrar contratos y ejemplos de respuestas compatibles, incluidos errores.
4. Crear casos de caracterización con datos ficticios para las dos experiencias
   y los tres resultados. Reemplazar los tests del alcance que usan borrados
   globales o SQL SQLite obsoleto. No ejecutar el conjunto antiguo para descubrir
   si es seguro.
5. Fijar una matriz de permisos: gestión, juego público y entrega. Mantener el
   comportamiento de sesión/OTP existente al delimitar la gestión administrativa.

### Cierre

Se pueden probar generación, juego y entrega sin conectarse a datos de negocio.
Hay casos reproducibles para los hallazgos prioritarios y quedan identificados
los contratos que no pueden romperse.

## Fase 2 — Revelación, resultado y entrega consistentes

### Trabajo

1. Extraer servicios de dominio de las rutas HTTP, con contratos tipados. Las
   rutas actuales delegan; no crear endpoints duplicados para la misma escritura.
2. Resolver el resultado exclusivamente en servidor. Retirar la capacidad pública
   de reemplazar assignedPrizeId arbitrariamente; revisar antes sus consumidores.
3. Hacer la revelación condicional y atómica. Rechazar consumidos y preservar
   evidencia; nunca limpiar una entrega/canje al revelar.
4. Resolver reintentos de red: repetir una operación no produce otro resultado
   ni otra entrega. Distinguir repetición compatible de conflicto de estado.
5. Compartir la política de disponibilidad entre consultar, revelar, redimir y
   entregar. Mantener las diferencias comerciales que sean intencionales.
6. Aplicar los permisos de gestión en servidor, además del control de navegación.

### Cierre

Peticiones simultáneas no cambian el premio ni reabren un token consumido. Los
rechazos no escriben cambios parciales. Entrega y responsable siguen funcionando
con sesión y OTP. Los QR anteriores continúan resolviendo por las mismas URLs.

## Fase 3 — Reintento recuperable y experiencias independientes

### Trabajo

1. Modelar y reclamar de manera exclusiva la continuación de RETRY. Preferir el
   emparejamiento existente válido. Un fallback, si corresponde a la política,
   no puede apropiarse de una reserva ajena ni asignar el mismo token dos veces.
2. No completar silenciosamente un reintento sin continuación: devolver un estado
   recuperable y un mensaje operativo según la política acordada.
3. Devolver la continuación desde servidor al recargar o reabrir el enlace. No
   depender de nextTokenId sólo en memoria del navegador.
4. Diferenciar reserva de desactivación manual; revelar RETRY no debe rehabilitar
   un token bloqueado manualmente.
5. Permitir raspa con un resultado disponible. Para ruleta, separar segmentos de
   presentación del inventario entregable, sin inventar premios reales.
6. Simplificar wait-ready: reutilizar disponibilidad, limitar consultas y tiempo,
   cancelar al abandonar y preferir devolver el resultado listo en la misma
   operación cuando ya esté confirmado. No añadir sockets por defecto.
7. Conservar el segundo juego manual actual y corregir el texto administrativo
   que anuncia un giro automático, salvo cambio comercial explícito.

### Cierre

Se puede recargar antes/durante/después de RETRY sin perder la continuación.
Dos reintentos no comparten un premio funcional. Un raspa válido no falla por
tener un solo tipo de premio. LOSE no ofrece registrar una entrega física.

## Fase 4 — Generación recuperable, stock, fechas y firmas

### Trabajo

1. Separar validación/planificación, persistencia y exportación. Definir el plan
   completo antes de consumir stock; validar participación y vigencia de premios.
2. Introducir idempotencia de emisión: repetir la misma solicitud recupera la
   operación/lote, no consume stock de nuevo. La clave identifica la intención
   de emisión y se comprueba contra el contenido de la solicitud.
3. Diseñar la persistencia según el tamaño permitido: transacciones acotadas o
   una operación con estados y recuperación. No mantener una transacción abierta
   mientras se dibujan QR o se transmite el ZIP.
4. Stock y contadores corresponden sólo a tokens persistidos de una emisión
   completada. Probar fallos entre etapas y recuperar sin borrar historial.
5. Descargar o reconstruir ZIP/CSV/manifiesto del lote ya creado. Un fallo de
   exportación no obliga a generar otro lote.
6. Unificar zona, fecha funcional, inicio y fin. Guardarlos como datos explícitos,
   sin deducir vigencia del nombre del lote ni de la zona local del servidor.
7. Separar programación de bloqueo manual para que el habilitador programado
   sólo active lo programado. Mantener deshabilitados los bloqueados manualmente.
8. Unificar selección de secretos por versión para generación y verificación.
   Conservar verificación histórica; no volver a firmar ni invalidar QR impresos.
9. Resolver el contrato de stock ilimitado: cantidad de emisión explícita o
   exclusión claramente indicada de la emisión total; nunca emitir infinitos.
10. Centralizar límites y políticas compartidas, validar variables de entorno y
    eliminar fallbacks inseguros de producción. No hacer configurable cada detalle
    visual ni sustituir constantes válidas por complejidad innecesaria.

### Cierre

Un fallo o reintento no duplica lotes ni pierde stock. Exportar es repetible. Las
fechas son iguales con distintas zonas del servidor. Funcionan firmas anteriores
y actuales. Las migraciones necesarias tienen recuperación y orden de despliegue
revisados; revertir código no debe requerir eliminar datos nuevos.

## Fase 5 — Componentes, catálogo y métricas

### Trabajo

1. Extraer componentes con responsabilidad concreta: SystemPrizeControls,
   PrizeStockEditor, PrizeCatalog, BatchGenerator y BatchStats. Mover componentes
   con estado fuera del render de otros componentes.
2. Extraer controladores de carga, revelación, continuidad y entrega. Mantener
   los presentadores visuales de ruleta y raspa que ya funcionan, así como sus
   recursos y comportamiento de audio/accesibilidad.
3. Tipos compartidos y errores legibles; retirar any y formatos de respuesta
   alternativos del alcance cuando sus consumidores ya estén adaptados.
4. Participación de premios en generadores mediante una regla explícita. No
   deducirla de includes('reusable') ni confundir catálogo con historial de uso.
5. Métricas de emitidos, disponibles, reservados, revelados pendientes, entregados,
   expirados y deshabilitados con definiciones claras. Evitar doble conteo de
   deliveredAt y el espejo redeemedAt. Sustituir ceros de relleno y la variable
   global sin productor por consultas agregadas fiables.
6. Datos públicos mediante consultas específicas/agregados, sin cargar todos los
   tokens del lote para construir segmentos.
7. Evitar estado desactualizado entre catálogo, stock, lotes e indicadores tras
   una operación. Actualizar de forma dirigida, sin recargas generales innecesarias.

### Cierre

Crear/editar premios y generar lotes usa componentes compartidos; las métricas
coinciden con los casos de prueba. No se mezclan lotes estáticos/reutilizables en
el panel de ruleta. La UI funciona en móvil pequeño, teclado y movimiento reducido.

## Fase 6 — Retirada y aceptación del recorrido completo

### Trabajo

1. Confirmar consumidores y retirar las implementaciones ya sustituidas, imports,
   tipos, estilos, flags, comentarios y tests que hayan quedado sin función.
   Revisar candidatos identificados en la auditoría; no borrar por nombre parecido.
2. Los endpoints antiguos con consumidores conservan un adaptador mínimo probado.
   Un 410 deliberado no se elimina sin revisar compatibilidad externa.
3. Ejecutar la matriz completa en un entorno aislado: generar → exportar → abrir
   QR → jugar → resultado → reabrir/copiar enlace → entregar → volver a consultar.
4. Probar concurrencia, caída de red después de confirmar una escritura, fallo de
   ZIP, rotación de secretos, límites de lote y zonas horarias distintas.
5. Comprobar roles, OTP incorrecto/revocado, sesión activa, token expirado,
   programado, deshabilitado y ya entregado. Verificar identidad del responsable.
6. Validar con los componentes reales ruleta y raspa, escritorio y móvil de
   pantalla pequeña. En la base conectada, sólo comprobaciones de lectura salvo
   operaciones reales expresamente autorizadas por el usuario.
7. Documentar contratos finales, políticas, recuperación operativa y despliegue.
   Reportar limitaciones reales; no declarar E2E completo por pasar pruebas unitarias.

### Cierre global

- La matriz funcional y las regresiones relevantes pasan en aislamiento.
- Tipos, lint del alcance y compilación pertinente pasan.
- No existen dos implementaciones activas para la misma responsabilidad.
- Todo adaptador restante tiene consumidores y finalidad documentados.
- Los datos e identificadores históricos se conservan y los indicadores verifican
  las invariantes de stock, asignación, canje y responsabilidad.
- El flujo anterior sigue operativo durante la transición y se puede recuperar
  de fallos de emisión/exportación sin regenerar premios accidentalmente.

## Orden y seguimiento

Ejecutar 1 → 2 → 3 → 4 → 5 → 6. Si una corrección requiere una parte del modelo de
otra fase, introducir únicamente la dependencia mínima probada, sin posponer la
integridad hasta la fase visual. Cada entrega informa: cambios, escenarios
verificados, compatibilidad, migraciones aplicadas y trabajo pendiente.

No asignar fechas ni prometer “cero riesgo” antes de ejecutar las pruebas. Los
hallazgos pueden ajustar el detalle del plan, manteniendo los criterios de cierre
y la prohibición de pruebas destructivas sobre datos reales.
