# Identidad automática de premios reutilizables

Crear un premio requiere nombre y descripción opcional. El servidor genera una
clave UUID con prefijo RP y un color hexadecimal. La interfaz y PATCH ya no
permiten asignar ni reemplazar esos valores. Los premios y QR existentes no
se migran ni se regeneran.

La política está en `src/lib/reusable-prizes/identity.ts`: se comparan candidatos
de tono con los últimos 12 colores, midiendo distancia perceptual OKLab. Se elige
el candidato cuya distancia al más cercano sea mayor. No hay una paleta fija por
premio ni una garantía de diferenciación ilimitada: con muchos premios, los
colores pueden reutilizarse fuera de la ventana reciente. Los nombres siguen
siendo la identificación principal.

Asignación y creación se ejecutan en transacción serializable; los conflictos
de concurrencia o unicidad se reintentan hasta el límite centralizado. Los colores
históricos nulos o inválidos no interrumpen la creación. Las constantes numéricas
OKLab/sRGB corresponden a la conversión de color, no a premios particulares.

Los enlaces de QR reutilizables usan el resolvedor de origen público compartido
con la URL de petición; se retiraron las copias del fallback localhost de estos
endpoints. Los colores manuales de grupos pertenecen a otra entidad y conservan
su funcionamiento.

Verificación: `npx vitest run tests/reusable-prizes` simula Prisma y no escribe
en base de datos. Incluye claves, secuencias de colores, conflictos y conservación
de identidad durante edición.

El flujo actualizado de generación, vigencia, consumo y cargas del panel se documenta en [Flujo de tokens reutilizables](reusable-token-flow.md).
