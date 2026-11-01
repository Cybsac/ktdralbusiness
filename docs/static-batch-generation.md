# Generación de pulseras interactivas

## Contrato compartido

`src/lib/batch/static-request.ts` valida nombre, cantidades, vigencia y los siete
tipos de acción, tanto en el formulario como en el servidor. El catálogo de tipos
vive en `components/token-actions/types.ts`; no hay una segunda lista en la API.
`static-policy.ts` centraliza límites de lote, inserciones y tiempo transaccional.

Cada variante requiere contenido válido: preguntas y una respuesta correcta,
frases, retos, nombre de sorteo, mensaje o pregunta de feedback. Los límites de
feedback y el valor predeterminado del sorteo son compartidos. La selección
estable de frase, reto o número se encuentra en `lib/token-actions/selection.ts`.
El número corto del sorteo es orientativo y puede repetirse; el identificador
único de cada participación sigue siendo su token/QR. No es un asignador de
números consecutivos únicos.

## QR obligatorio

No hay selector de QR en la creación. La API ignora las antiguas propiedades
includeQr/lazyQr y siempre exporta PNG, CSV y manifiesto con qrMode eager.
El generador estático ya no conserva esas ramas opcionales. La re-descarga de
lotes estáticos incluye PNG incluso sin qr=1; otros tipos conservan su contrato.
El QR de una frase o mensaje abre la experiencia: no otorga un premio físico.

## Validación antes de escrituras

Las fechas y ventanas se resuelven antes de crear lotes o consumir stock.
Los tokens nacen con expiresAt/validFrom definitivos y se firman con esa misma
fecha, usando el mapa central de secretos y su versión actual. Se eliminaron
el post-proceso de fechas y el secreto duplicado del generador estático.
La entrega también rechaza tokens cuya ventana aún no empieza.

La transacción agrupa metadata del lote, stock e inserción de todos los tokens;
si falla una parte se revierte. Las entradas repetidas de premio se agregan antes
de validar stock. Se respeta stock ilimitado (null). Frase/mensaje no consumen
stock; los lotes nuevos sin premio utilizan una referencia interna propia, oculta del catálogo comercial. No requieren crear antes un premio de inventario. Las referencias de tokens anteriores se conservan.

## Variantes públicas

Se corrigió el orden de hooks en trivia cuando cambia la vista de sesión y se
movió la notificación de finalización fuera del render. Feedback y retos ya no
anuncian éxito si falla el guardado. Se conservan las reglas actuales de premio,
completado, autorización y formato de los mensajes.

## Verificación sin datos reales

`tests/static-generation` simula Prisma, firmas y QR. Comprueba validación de los
siete tipos, fechas, ZIP con PNG obligatorio, re-descarga y rollback simulado.
No ejecuta suites de base de datos ni genera lotes reales. Los fallos de red o
disco durante el empaquetado posterior a la transacción no revierten un lote ya
creado: puede descargarse de nuevo desde la administración.

## Auditoría de lógica de `/admin/prizesstatics`

- Se retiró la paleta y su estado, validaciones y escrituras de color. Las altas usan `scope=static`; el servidor asigna una identidad única y elige un color con el algoritmo compartido de distancia perceptual respecto a los colores recientes. Editar nombre, cantidad o actividad conserva el color anterior.
- La consulta inicial y el refresco usan el mismo catálogo tipado. No incluyen premios de sistema, referencias internas sin premio ni reutilizables. Las escrituras con ámbito estático verifican la pertenencia del premio y no aceptan cambiar opciones de otros módulos.
- Se mantiene la distribución y los controles de la pantalla, salvo la paleta solicitada. El guardado utiliza un bloqueo real durante la operación asíncrona; la generación también evita dobles pulsaciones simultáneas.
- Tras generar, se actualizan stock, tablas y lotes desde el servidor y se vacían las cantidades consumidas. Eliminar o agotar un premio retira cantidades antiguas de la selección.
- Las fechas operativas proceden de la vigencia seleccionada, nunca de texto del nombre. Se eliminaron la extracción de fechas mediante expresiones regulares y el ordenamiento con valores centinela.
- Revelados pendientes, entregados y expirados consultan registros reales; el indicador de expiración ya no es un «Sí» fijo vinculado a la actividad del premio. La cantidad emitida al seleccionar un lote corresponde a ese lote.
- Sorteos comparten límites entre formulario y servidor. Los mensajes mantienen su HTML de formato, limpiando contenido ejecutable tanto al generar como al servir mensajes anteriores; los enlaces de llamada a la acción admiten HTTP/HTTPS.
- Los límites y variantes existentes (premio, trivia, frase, reto, sorteo, mensaje y feedback), QR obligatorio y modalidades de vigencia se conservan. No hay migración ni actualización masiva de premios existentes.

Validación de esta auditoría: revisión de tipos y comprobaciones aisladas de solicitudes, creación, generación, ausencia de inventario para contenido y limpieza de HTML. Las pruebas permanecen en local; no se generan lotes de prueba ni se ejecutan borrados en la base conectada.
