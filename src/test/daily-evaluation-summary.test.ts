import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authState = vi.hoisted(() => ({ role: 'ADMIN' }));
const db = vi.hoisted(() => ({
  scan: { findMany: vi.fn() }, person: { findMany: vi.fn() }, token: { findMany: vi.fn() },
  birthdayReservation: { findMany: vi.fn() }, specialEvent: { findMany: vi.fn() },
  tokenGroup: { findMany: vi.fn() }, reusableToken: { findMany: vi.fn() }, reusableTokenRedemption: { findMany: vi.fn() }, batch: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'session', verifyUserSessionCookie: async () => ({ userId: 'u', role: authState.role }) }));
import { GET } from '@/app/api/admin/daily-evaluation/summary/route';

describe('contrato del resumen de jornada', () => {
  it('conserva los resultados de asistencia, premios, invitados y reutilizables', async () => {
    const person = { id: 'p1', name: 'Ana', code: '1', area: 'Caja' };
    db.scan.findMany.mockResolvedValue([{ personId: 'p1', person, type: 'IN', scannedAt: new Date('2025-01-01T20:00:00Z') }]);
    db.person.findMany.mockResolvedValue([{ id: 'p1' }]);
    db.birthdayReservation.findMany.mockResolvedValue([{ id: 'b', celebrantName: 'Sol', status: 'confirmed', guestsPlanned: 4, guestArrivals: 2, hostArrivedAt: new Date(), wantsPhotoSession: true, pack: { name: 'Pack' } }]);
    db.specialEvent.findMany.mockResolvedValue([{ id: 'e', name: 'Show', timeSlot: '20:00', invitations: [{ id: 'i', guestName: 'Luis', guestCategory: null, status: 'arrived', arrivedAt: new Date('2025-01-02T02:00:00Z') }] }]);
    db.tokenGroup.findMany.mockResolvedValue([{ id: 'g', name: 'Grupo', color: null, locked: false, sortOrder: 0 }]);
    db.reusableToken.findMany.mockResolvedValue([{ id: 't', groupId: 'g', disabled: false, expiresAt: new Date('2099-01-01T00:00:00Z'), startTime: null, endTime: null, usedCount: 2, maxUses: 5, prize: { id: 'x', label: 'Premio', active: true }, _count: { redemptions: 2 } }]);
    db.reusableTokenRedemption.findMany.mockResolvedValue(Array.from({ length: 2 }, () => ({ note: null, token: { groupId: 'g', group: { id: 'g', name: 'Grupo', color: null }, prize: { id: 'x', label: 'Premio' } } })));
    db.batch.findFirst.mockResolvedValue(null);
    db.token.findMany.mockImplementation(async (args) => {
      if (args.where.batch?.functionalDate && args.select) return [{ deliveredAt: new Date('2025-01-01T23:00:00Z'), prize: { id: 'x', label: 'Premio' }, batch: { id: 'batch', description: 'Jornada' } }, { deliveredAt: new Date('2025-01-03T00:00:00Z'), prize: { id: 'x', label: 'Premio' }, batch: { id: 'batch', description: 'Jornada' } }];
      if (args.where.revealedAt && args.where.batch?.isReusable === false) return [{ prize: { id: 'x', label: 'Premio' }, deliveredAt: null }, { prize: { id: 'x', label: 'Premio' }, deliveredAt: new Date('2025-01-01T23:00:00Z') }, { prize: { id: 'x', label: 'Premio' }, deliveredAt: new Date('2025-01-03T00:00:00Z') }];
      if (args.where.batch?.isReusable === false) return [{ deliveredAt: new Date('2025-01-01T20:00:00Z'), deliveredByUserId: null, prize: { id: 'x', label: 'Premio' } }];
      return [];
    });
    const response = await GET(new NextRequest('http://localhost/api/admin/daily-evaluation/summary?day=2025-01-01'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.attendance).toEqual([{ person, firstIn: '2025-01-01T20:00:00.000Z', lastOut: null, missingExit: true, evaluable: true }]);
    expect(data.deliveredPrizes).toEqual([{ label: 'Premio', count: 1, operators: [{ name: 'Usuario no disponible', count: 1 }] }]);
    expect(data.totalDelivered).toBe(1);
    expect(data.dayPrizes).toEqual([{ id: 'x', label: 'Premio' }]);
    expect(data.totalTokensInBatches).toBe(2);
    expect(data.programmedDelivered).toBe(1);
    expect(data.programmedPrizeProgress).toEqual([{ id: 'x', label: 'Premio', total: 2, delivered: 1 }]);
    expect(data.programmedBatches).toEqual([{ id: 'batch', description: 'Jornada', count: 2 }]);
    expect(data.programmedPrizes).toEqual([{ id: 'x', label: 'Premio', count: 2 }]);
    expect(data.totalPlayed).toBe(3);
    expect(data.playedPrizes).toEqual([{ id: 'x', label: 'Premio', count: 3, pending: 2 }]);
    expect(data.birthdays).toMatchObject({ total: 1, arrived: 1, totalGuests: 4, arrivedGuests: 2 });
    expect(data.specialGuests).toMatchObject({ total: 1, arrived: 1, lastArrivalAt: '2025-01-02T02:00:00.000Z' });
    expect(data.reusableGroups).toEqual([expect.objectContaining({ id: 'g', name: 'Grupo', color: null, totalTokens: 1, activeTokens: 1, daySales: 2, remainingUses: 3, estimatedEvents: 2, prizes: [expect.objectContaining({ label: 'Premio', total: 1, daySales: 2 })] })]);
    expect(data.staticBatches).toEqual({ interactive: null, deliveredToday: 0, deliveredPrizes: [], revealedToday: 0, revealedPrizes: [], inCirculation: 0, circulationPrizes: [], availableTotal: 0, availablePrizes: [] });
  });
  it('no entrega datos de asistencia del equipo a colaboradores', async () => {
    authState.role = 'COLLAB';
    db.scan.findMany.mockClear();
    const response = await GET(new NextRequest('http://localhost/api/admin/daily-evaluation/summary?day=2025-01-01'));
    expect(response.status).toBe(200);
    expect((await response.json()).attendance).toEqual([]);
    expect(db.scan.findMany).not.toHaveBeenCalled();
    authState.role = 'ADMIN';
  });
});
