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
stock; conservan una referencia a un premio activo por la estructura existente
Token.prizeId, que no se migra ni se elimina.

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
