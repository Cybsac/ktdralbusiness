# Auditoría móvil de canjes públicos

## Alcance

Revisión de estilos y estructura de reutilizables, estáticos, premios revelados,
ruleta, Mundial, Fan Zone, validación de ofertas y acceso OTP compartido.
Sorteos e intercambio conservan sus pantallas administrativas; no se abre el
intercambio público como parte de esta revisión.

## Correcciones

- OTP: botones apilados en móvil, área táctil de 44 px, menor relleno y altura
  limitada por `100dvh`, con desplazamiento interno cuando hay poca altura.
- QR: ancho máximo relativo al contenedor y relación cuadrada; menor relleno
  en tarjetas pequeñas, sin deformar ni recortar el código.
- Premios y códigos largos: ajuste de palabras en ruleta, Fan Zone y vista
  de canje. Los elementos flex/grid pueden reducir su ancho.
- Modales de premio y confirmación: margen lateral, altura máxima y scroll.
- Ofertas: menor margen exterior en móvil.
- Acceso de personal: admite varias líneas y respeta el ancho disponible.

## Comprobación realizada

Reutilizable público existente, sin pulsar entrega: 320x568, 360x640,
390x844 y 568x320. En todos, ancho de documento igual al viewport y QR completo
(176 px), sin desbordamiento horizontal.

OTP real renderizado con React y CSS del repositorio en un servidor efímero
independiente, con una solicitud simulada que no consulta APIs ni base de datos:
320x480, 320x240, 360x640, 390x844 y 568x320. Sin desbordamiento; el modal
reduce su altura y permite scroll. La altura 240 simula espacio disponible
reducido; no equivale a probar el teclado físico de iOS/Android.

Las demás variantes recibieron revisión de código, no una certificación visual
de todos sus estados con premios reales. No se crearon ni canjearon tokens.
