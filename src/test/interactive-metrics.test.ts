import { describe, expect, it } from 'vitest';
import { deliveryOperators, interactiveMetrics } from '@/lib/daily-evaluation-summary/interactiveMetrics';

const token = (deliveredAt: string | null = null, revealedAt: string | null = null) => ({
  deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
  revealedAt: revealedAt ? new Date(revealedAt) : null,
  expiresAt: new Date('2025-03-01T00:00:00Z'), validFrom: null, disabled: false, prize: { label: 'Premio', color: null },
});

describe('tokens interactivos por jornada', () => {
  it('distingue estados acumulados de entregas de la jornada', () => {
    const tokens = [
      ...Array.from({ length: 3 }, () => token('2025-01-01T20:00:00Z')),
      ...Array.from({ length: 4 }, () => token('2025-01-02T20:00:00Z')),
      token(null, '2025-01-02T21:00:00Z'),
      ...Array.from({ length: 7 }, () => token()),
    ];
    const day = interactiveMetrics(tokens, new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'));
    expect(day).toMatchObject({ total: 15, redeemed: 7, available: 7, deliveredToday: 4, inCirculation: 1 });
    const next = interactiveMetrics(tokens, new Date('2025-01-03T15:00:00Z'), new Date('2025-01-04T15:00:00Z'));
    expect(next).toMatchObject({ total: 15, redeemed: 7, available: 7, deliveredToday: 0, inCirculation: 1 });
  });
  it('muestra circulación histórica solo si todavía no había entrega en ese corte', () => {
    const tokens = [token('2025-01-04T20:00:00Z', '2025-01-02T20:00:00Z')];
    const result = interactiveMetrics(tokens, new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'));
    expect(result).toMatchObject({ redeemed: 0, deliveredToday: 0, inCirculation: 1 });
  });
  it('aplica correctamente los límites de jornada', () => {
    const result = interactiveMetrics([token('2025-01-02T15:00:00Z'), token('2025-01-03T15:00:00Z')], new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'));
    expect(result).toMatchObject({ total: 2, redeemed: 1, deliveredToday: 1 });
  });
  it('separa tokens vencidos y deshabilitados de los disponibles', () => {
    const expired = { ...token(), expiresAt: new Date('2025-01-02T14:00:00Z') };
    const disabled = { ...token(), disabled: true };
    const result = interactiveMetrics([expired, disabled, token()], new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'));
    expect(result).toMatchObject({ total: 3, available: 1, expired: 1, disabled: 1, unavailable: 2, deliveredToday: 0 });
  });
  it('clasifica cada token una sola vez y cuenta entregas aunque luego se deshabilite', () => {
    const scheduled = { ...token(), validFrom: new Date('2025-01-04T00:00:00Z') };
    const deliveredDisabled = { ...token('2025-01-02T20:00:00Z'), disabled: true };
    const result = interactiveMetrics([scheduled, deliveredDisabled, token(), token(null, '2025-01-02T20:00:00Z')], new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'));
    expect(result).toMatchObject({ total: 4, available: 1, inCirculation: 1, redeemed: 1, deliveredToday: 1, unavailable: 1, upcoming: 1 });
    expect(result.available + result.inCirculation + result.redeemed + result.unavailable).toBe(result.total);
  });
  it('agrupa operadores por premio sin exponer IDs y conserva entregas sin usuario', () => {
    const tokens = [
      { ...token('2025-01-02T20:00:00Z'), deliveredByUserId: 'u1' },
      { ...token('2025-01-02T21:00:00Z'), deliveredByUserId: 'u1' },
      { ...token('2025-01-02T22:00:00Z'), deliveredByUserId: null },
      { ...token('2025-01-01T22:00:00Z'), deliveredByUserId: 'u2' },
    ];
    const groups = deliveryOperators(tokens, new Date('2025-01-02T15:00:00Z'), new Date('2025-01-03T15:00:00Z'), new Map([['u1', 'Ana Pérez']]));
    expect(groups.get('Premio')).toEqual([{ name: 'Ana Pérez', count: 2 }, { name: 'Usuario no disponible', count: 1 }]);
  });
});
