import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MISSING_EXIT_NOTE, adjustMissingExit, isBusinessDay } from '@/lib/daily-evaluation';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  dailyEvaluation: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  scan: { findMany: vi.fn() },
  person: { findMany: vi.fn() },
  personDailyRating: { findMany: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'session', verifyUserSessionCookie: async () => ({ userId: 'admin', role: 'ADMIN' }) }));
import { PATCH } from '@/app/api/admin/daily-evaluation/route';

const request = (body: object) => new NextRequest('http://localhost/api/admin/daily-evaluation', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const payload = { businessDay: '2025-01-01', action: 'close', rating: 'BUENO', comment: 'Buena jornada', ratings: [{ personId: 'p1', rating: 'BUENO', note: '' }] };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.dailyEvaluation.findUnique.mockResolvedValue(null);
  db.dailyEvaluation.upsert.mockResolvedValue({ businessDay: payload.businessDay, closedAt: new Date() });
  db.scan.findMany.mockResolvedValue([{ personId: 'p1', type: 'IN' }]);
  db.person.findMany.mockResolvedValue([{ id: 'p1', name: 'Persona' }]);
  db.personDailyRating.findMany.mockResolvedValue([]);
  db.personDailyRating.upsert.mockResolvedValue({});
});

describe('evaluación de jornada', () => {
  it('valida fechas reales', () => {
    expect(isBusinessDay('2025-02-29')).toBe(false);
    expect(isBusinessDay('2024-02-29')).toBe(true);
    expect(isBusinessDay('2025-13-01')).toBe(false);
  });
  it('ajusta una sola vez y conserva el mínimo', () => {
    expect(adjustMissingExit('BUENO', '', false).rating).toBe('REGULAR');
    expect(adjustMissingExit('MALO', '', false).rating).toBe('MALO');
    expect(adjustMissingExit('REGULAR', MISSING_EXIT_NOTE, true).rating).toBe('REGULAR');
  });
  it('cierra y guarda el ajuste en la transacción', async () => {
    const response = await PATCH(request(payload));
    expect(response.status).toBe(200);
    expect(db.personDailyRating.upsert.mock.calls[0][0].create).toMatchObject({ rating: 'REGULAR', note: MISSING_EXIT_NOTE, originalRating: 'BUENO', adjustmentReason: 'MISSING_EXIT', adjustedAt: expect.any(Date) });
    expect(db.dailyEvaluation.upsert).toHaveBeenCalledOnce();
  });
  it('no vuelve a descontar tras reabrir ni pierde la marca histórica', async () => {
    db.personDailyRating.findMany.mockResolvedValue([{ personId: 'p1', adjustmentReason: 'MISSING_EXIT' }]);
    const response = await PATCH(request({ ...payload, ratings: [{ personId: 'p1', rating: 'REGULAR', note: 'comentario' }] }));
    expect(response.status).toBe(200);
    expect(db.personDailyRating.upsert.mock.calls[0][0].create).toMatchObject({ rating: 'REGULAR', note: `comentario | ${MISSING_EXIT_NOTE}` });
  });
  it('rechaza cierres repetidos sin sobrescribir', async () => {
    db.dailyEvaluation.findUnique.mockResolvedValue({ closedAt: new Date() });
    expect((await PATCH(request(payload))).status).toBe(409);
    expect(db.dailyEvaluation.upsert).not.toHaveBeenCalled();
    expect(db.personDailyRating.upsert).not.toHaveBeenCalled();
  });
  it('rechaza personas sin calificación y entradas duplicadas', async () => {
    expect((await PATCH(request({ ...payload, ratings: [] }))).status).toBe(400);
    expect((await PATCH(request({ ...payload, ratings: [payload.ratings[0], payload.ratings[0]] }))).status).toBe(400);
    expect(db.dailyEvaluation.upsert).not.toHaveBeenCalled();
  });
});
