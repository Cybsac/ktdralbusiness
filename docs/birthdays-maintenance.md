# Mantenimiento del Sistema de Cumpleaños

Este documento cubre todas las tareas operativas, mantenimiento y troubleshooting del sistema completo de cumpleaños de Go Lounge, incluyendo reservas, tokens QR, validaciones y reportes.

## 📋 Resumen del Sistema

El sistema de cumpleaños permite a los clientes reservar fiestas privadas con:
- **Paquetes**: Diferentes opciones con QR codes para invitados
- **Tokens QR**: Invitaciones digitales (host + multi-use guest)
- **Validación**: Staff registra llegadas en tiempo real
- **Métricas**: Seguimiento de conversiones y asistencia

### Componentes Principales
- **Reservas**: Gestión de bookings con datos del cliente
- **Paquetes**: Configuración de opciones disponibles
- **Tokens**: Sistema QR para acceso
- **Validación**: Registro de llegadas por staff
- **Reportes**: Métricas y análisis

---

## 🎫 Gestión de Paquetes

### Ver Paquetes Activos
```sql
SELECT id, name, qr_count, bottle, price_soles, active, featured
FROM "BirthdayPack"
WHERE active = true
ORDER BY name;
```

### Crear Nuevo Paquete
```sql
INSERT INTO "BirthdayPack" (name, qr_count, bottle, price_soles, perks, featured, active)
VALUES ('Pack Premium', 15, 'Cerveza Corona + Pisco Sour', 200.00, '["Mesa VIP", "Botella incluida", "Decoración especial"]', true, true);
```

### Actualizar Precios
```sql
UPDATE "BirthdayPack"
SET price_soles = 180.00
WHERE id = 'pack_id';
```

### Desactivar Paquete
```sql
UPDATE "BirthdayPack"
SET active = false
WHERE id = 'pack_id';
```

---

## 📅 Gestión de Reservas

### Ver Reservas Activas
```sql
SELECT r.id, r.celebrant_name, r.date, r.time_slot, p.name as pack_name,
       r.guests_planned, r.status, r.created_at
FROM "BirthdayReservation" r
JOIN "BirthdayPack" p ON r.pack_id = p.id
WHERE r.status IN ('pending', 'active', 'completed')
ORDER BY r.date ASC;
```

### Ver Reservas por Fecha
```sql
SELECT id, celebrant_name, phone, status, tokens_generated_at
FROM "BirthdayReservation"
WHERE date = '2025-12-01'
ORDER BY time_slot;
```

### Cancelar Reserva
```sql
UPDATE "BirthdayReservation"
SET status = 'cancelled'
WHERE id = 'reservation_id';
```

### Forzar Generación de Tokens
```sql
UPDATE "BirthdayReservation"
SET tokens_generated_at = NULL
WHERE id = 'reservation_id';
-- Luego llamar POST /api/birthdays/reservations/:id/tokens
```

---

## 🎟️ Gestión de Tokens QR

### Ver Tokens de una Reserva
```sql
SELECT t.code, t.kind, t.status, t.expires_at, t.used_count, t.max_uses
FROM "InviteToken" t
WHERE t.reservation_id = 'reservation_id'
ORDER BY t.kind DESC, t.code ASC;
```

### Ver Tokens Expirados
```sql
SELECT r.celebrant_name, t.code, t.kind, t.expires_at, t.status
FROM "InviteToken" t
JOIN "BirthdayReservation" r ON t.reservation_id = r.id
WHERE t.expires_at < NOW()
  AND t.status NOT IN ('redeemed', 'exhausted')
ORDER BY t.expires_at DESC;
```

### Resetear Token Agotado
```sql
UPDATE "InviteToken"
SET status = 'active', used_count = 0
WHERE code = 'ABC123' AND status = 'exhausted';
```

### Ver Redeems Recientes
```sql
SELECT tr.redeemed_at, t.code, t.kind, u.name as redeemed_by,
       r.celebrant_name, tr.device, tr.location
FROM "TokenRedemption" tr
JOIN "InviteToken" t ON tr.token_id = t.id
JOIN "BirthdayReservation" r ON t.reservation_id = r.id
LEFT JOIN "User" u ON tr.redeemed_by = u.id
WHERE tr.redeemed_at >= NOW() - INTERVAL '24 hours'
ORDER BY tr.redeemed_at DESC;
```

---

## 👥 Gestión de Llegadas

### Ver Estado de Llegadas
```sql
SELECT r.celebrant_name, r.guests_planned,
       r.host_arrived_at, r.guest_arrivals,
       r.created_at, r.updated_at
FROM "BirthdayReservation" r
WHERE r.date = CURRENT_DATE
ORDER BY r.time_slot;
```

### Resetear Contadores de Llegada
```sql
UPDATE "BirthdayReservation"
SET host_arrived_at = NULL, guest_arrivals = 0
WHERE id = 'reservation_id';
```

### Ver Llegadas por Día
```sql
SELECT DATE(r.date) as fecha,
       COUNT(*) as total_reservas,
       SUM(CASE WHEN r.host_arrived_at IS NOT NULL THEN 1 ELSE 0 END) as hosts_llegaron,
       SUM(r.guest_arrivals) as total_invitados
FROM "BirthdayReservation" r
WHERE r.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(r.date)
ORDER BY fecha DESC;
```

---

## 🔗 Gestión de Referrers

### Ver Top Referrers
```sql
SELECT rf.name, rf.phone, COUNT(r.id) as reservas_referidas,
       MAX(r.created_at) as ultima_reserva
FROM "Referrer" rf
LEFT JOIN "BirthdayReservation" r ON rf.id = r.referrer_id
GROUP BY rf.id, rf.name, rf.phone
ORDER BY reservas_referidas DESC;
```

### Crear Nuevo Referrer
```sql
INSERT INTO "Referrer" (name, phone, email)
VALUES ('Restaurante XYZ', '+51 999 999 999', 'contacto@xyz.com');
```

### Ver Conversiones por Referrer
```sql
SELECT rf.name,
       COUNT(r.id) as total_reservas,
       SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completadas,
       ROUND(
         SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END)::decimal /
         NULLIF(COUNT(r.id), 0) * 100, 1
       ) as tasa_conversion
FROM "Referrer" rf
LEFT JOIN "BirthdayReservation" r ON rf.id = r.referrer_id
GROUP BY rf.id, rf.name
ORDER BY tasa_conversion DESC;
```

---

## 🧹 Limpieza y Mantenimiento

### Script de Purga Automática
```bash
# Ejecutar diariamente
npm run purge:birthday-data
```

### Datos a Purgar
- **Tokens expirados**: Después de 30 días
- **Reservas canceladas**: Después de 90 días
- **Redemptions antiguas**: Después de 1 año
- **Tarjetas generadas**: Después de expiración + 30 días

### Ver Datos Candidatos a Purga
```sql
-- Tokens expirados hace más de 30 días
SELECT COUNT(*) as tokens_to_purge
FROM "InviteToken"
WHERE expires_at < NOW() - INTERVAL '30 days'
  AND status IN ('expired', 'active');

-- Reservas canceladas hace más de 90 días
SELECT COUNT(*) as reservations_to_purge
FROM "BirthdayReservation"
WHERE status = 'cancelled'
  AND updated_at < NOW() - INTERVAL '90 days';
```

### Backup Antes de Purgar
```bash
# Crear backup de datos de cumpleaños
pg_dump -h localhost -U user -d database \
  -t "BirthdayReservation" \
  -t "InviteToken" \
  -t "TokenRedemption" \
  -t "BirthdayPack" \
  > birthday_backup_$(date +%Y%m%d).sql
```

---

## 📊 Reportes y Métricas

### Reporte Mensual de Cumpleaños
```sql
SELECT
  DATE_TRUNC('month', r.date) as mes,
  COUNT(*) as total_reservas,
  COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completadas,
  SUM(p.price_soles) as ingresos_totales,
  AVG(r.guests_planned) as invitados_promedio,
  SUM(r.guest_arrivals) as total_asistentes
FROM "BirthdayReservation" r
JOIN "BirthdayPack" p ON r.pack_id = p.id
WHERE r.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
GROUP BY DATE_TRUNC('month', r.date)
ORDER BY mes DESC;
```

### Tasa de Conversión por Paquete
```sql
SELECT p.name as paquete,
       COUNT(r.id) as reservas,
       COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completadas,
       ROUND(
         COUNT(CASE WHEN r.status = 'completed' THEN 1 END)::decimal /
         NULLIF(COUNT(r.id), 0) * 100, 1
       ) as conversion_pct
FROM "BirthdayPack" p
LEFT JOIN "BirthdayReservation" r ON p.id = r.pack_id
WHERE r.date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY p.id, p.name
ORDER BY conversion_pct DESC;
```

### Horarios Más Populares
```sql
SELECT time_slot, COUNT(*) as reservas
FROM "BirthdayReservation"
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND status != 'cancelled'
GROUP BY time_slot
ORDER BY reservas DESC;
```

---

## 🔧 Troubleshooting

### Problemas Comunes

#### Tokens No se Generan
```sql
-- Verificar estado de reserva
SELECT id, status, tokens_generated_at, pack_id
FROM "BirthdayReservation"
WHERE id = 'reservation_id';

-- Si tokens_generated_at es NULL, intentar regenerar
UPDATE "BirthdayReservation"
SET tokens_generated_at = NULL
WHERE id = 'reservation_id';
```

#### Invitados No Pueden Validar
```sql
-- Verificar token existe y no expiró
SELECT code, status, expires_at, used_count, max_uses
FROM "InviteToken"
WHERE code = 'ABC123';

-- Verificar reserva activa
SELECT id, status, date, time_slot
FROM "BirthdayReservation"
WHERE id = (
  SELECT reservation_id FROM "InviteToken" WHERE code = 'ABC123'
);
```

#### Contadores de Llegada Incorrectos
```sql
-- Resetear contadores
UPDATE "BirthdayReservation"
SET guest_arrivals = (
  SELECT COUNT(*)
  FROM "TokenRedemption" tr
  JOIN "InviteToken" t ON tr.token_id = t.id
  WHERE t.reservation_id = 'reservation_id'
    AND t.kind = 'guest'
)
WHERE id = 'reservation_id';
```

#### Reserva No Aparece en App
```sql
-- Verificar feature flag
SELECT value FROM "FeatureFlag" WHERE key = 'birthdays_enabled';

-- Si está desactivado, activar
UPDATE "FeatureFlag"
SET value = 'true'
WHERE key = 'birthdays_enabled';
```

### Logs Útiles
```bash
# Ver logs de generación de tokens
grep "BIRTHDAYS.*tokens" logs/app.log

# Ver logs de validación
grep "BIRTHDAYS.*redeem" logs/app.log

# Ver errores de cumpleaños
grep "BIRTHDAYS.*error" logs/app.log
```

---

## 🎨 Gestión de Tarjetas (Legacy)

### Generación de Tarjetas Físicas
- **Endpoint**: `POST /api/admin/birthdays/:id/cards/generate`
- **Templates**: `public/birthdays/templates/`
- **Almacenamiento**: `public/birthday-cards/<reservationId>/`

### Purga de Tarjetas Antiguas
```bash
# Script de purga
npm run purge:birthday-cards
```

> **Nota**: Las tarjetas físicas están siendo reemplazadas por el sistema QR digital.

---

## 🚨 Alertas y Monitoreo

### Métricas Críticas a Monitorear
- **Reservas sin tokens**: Reservas con `tokens_generated_at = NULL`
- **Tokens expirados activos**: Tokens con `status = 'active'` pero `expires_at` pasado
- **Llegadas sin host**: Reservas con `guest_arrivals > 0` pero `host_arrived_at = NULL`

### Queries de Monitoreo
```sql
-- Alertas críticas
SELECT 'Reservas sin tokens' as alerta, COUNT(*) as cantidad
FROM "BirthdayReservation"
WHERE tokens_generated_at IS NULL
  AND status = 'active'
  AND date > CURRENT_DATE

UNION ALL

SELECT 'Tokens expirados activos', COUNT(*)
FROM "InviteToken"
WHERE status = 'active'
  AND expires_at < NOW()

UNION ALL

SELECT 'Llegadas sin host', COUNT(*)
FROM "BirthdayReservation"
WHERE guest_arrivals > 0
  AND host_arrived_at IS NULL
  AND date = CURRENT_DATE;
```

---

## 📞 APIs Administrativas

### Gestión Manual desde Admin
- **Ver reservas**: `GET /api/admin/birthdays/reservations`
- **Ver tokens**: `GET /api/admin/birthdays/:id/tokens`
- **Generar tokens**: `POST /api/admin/birthdays/:id/generate-tokens`
- **Validar manual**: `POST /api/admin/birthdays/tokens/:code/redeem`

### Health Check
```bash
# Verificar estado del sistema
curl -H "Authorization: Basic $(echo -n 'health:HEALTH_TOKEN' | base64)" \
  http://localhost:3000/api/admin/birthdays/health
```


## Edición de reservas y regeneración de tarjetas

Desde `/u/birthdays` y `/admin/birthdays`, «Editar reserva» abre el detalle con un formulario común. Permite corregir nombre, DNI, WhatsApp, correo, fecha, hora, paquete, invitados previstos y sesión de fotos. «Guardar y regenerar tarjeta» guarda primero los datos y después compone una nueva imagen. Si el almacenamiento falla, los datos permanecen guardados y «Regenerar tarjeta» permite reintentar.

- `PATCH /api/admin/birthdays/:id`: requiere sesión autorizada y `expectedUpdatedAt`; evita sobrescribir cambios simultáneos. Mantiene los códigos QR, sus usos, estado e historial.
- Cambiar fecha recalcula la expiración al final del día de Lima y firma el claim actualizado. Cambiar paquete ajusta el máximo de usos del token universal según `qrCount`. Se bloquean ambos cambios si ya hubo ingresos o usos.
- `POST /api/admin/birthdays/:id/cards/generate?regenerate=1`: reemplaza la referencia de imagen usando un archivo nuevo para evitar caché. No fuerza la regeneración de tokens.
- La descarga estándar y el endpoint público de imagen componen la tarjeta con los datos actuales. Las exportaciones con `templateId` explícito conservan su flujo de impresión.
- Las pruebas `tests/birthdays/update_reservation.test.ts` y `tests/birthdays/regenerate_cards.test.ts` usan dobles de Prisma y almacenamiento; no conectan a una base de datos. No ejecutar suites generales o E2E contra bases con datos reales.
