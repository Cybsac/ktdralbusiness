import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MISSING_EXIT_NOTE, adjustMissingExit, isBusinessDay } from '@/lib/daily-evaluation';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  eventLog: { create: vi.fn() },
  dailyEvaluation: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  scan: { findMany: vi.fn() },
  person: { findMany: vi.fn() },
  personDailyRating: { findMany: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'session', verifyUserSessionCookie: async () => ({ userId: 'admin', role: 'ADMIN' }) }));
import { PATCH, POST } from '@/app/api/admin/daily-evaluation/route';

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
  db.eventLog.create.mockResolvedValue({});
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
  it('rechaza calificaciones de personas no presentes', async () => {
    const response = await PATCH(request({ ...payload, ratings: [...payload.ratings, { personId: 'extra', rating: 'BUENO' }] }));
    expect(response.status).toBe(409);
    expect(db.dailyEvaluation.upsert).not.toHaveBeenCalled();
  });
  it('conserva la evaluación previa en la auditoría al reabrir', async () => {
    db.dailyEvaluation.findUnique.mockResolvedValue({ businessDay: payload.businessDay, closedAt: new Date('2025-01-02T01:00:00Z'), rating: 'BUENO', comment: 'Comentario', evaluatedByUserId: 'u', closedByUserId: 'u' });
    db.dailyEvaluation.update.mockResolvedValue({ closedAt: null });
    const response = await PATCH(request({ businessDay: payload.businessDay, action: 'reopen' }));
    expect(response.status).toBe(200);
    const entry = db.eventLog.create.mock.calls[0][0].data;
    expect(entry.type).toBe('DAILY_EVALUATION_REOPENED');
    expect(JSON.parse(entry.metadata)).toMatchObject({ businessDay: payload.businessDay, previous: { rating: 'BUENO', comment: 'Comentario' } });
  });
  it('no reabre jornadas inexistentes ni abiertas', async () => {
    expect((await PATCH(request({ businessDay: payload.businessDay, action: 'reopen' }))).status).toBe(404);
    db.dailyEvaluation.findUnique.mockResolvedValue({ closedAt: null });
    expect((await PATCH(request({ businessDay: payload.businessDay, action: 'reopen' }))).status).toBe(409);
    expect(db.eventLog.create).not.toHaveBeenCalled();
  });
  it('no guarda una evaluación antigua si la jornada cambió durante la operación', async () => {
    db.dailyEvaluation.findUnique.mockResolvedValue({ closedAt: new Date(), rating: null });
    db.dailyEvaluation.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(new NextRequest('http://localhost/api/admin/daily-evaluation', { method: 'POST', body: JSON.stringify({ businessDay: payload.businessDay, rating: 'BUENO', comment: 'Bien' }) }));
    expect(response.status).toBe(409);
    expect(db.dailyEvaluation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessDay: payload.businessDay, closedAt: { not: null }, rating: null } }));
  });
  it('impide que coordinación reabra una jornada', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'COORDINATOR' });
    expect((await PATCH(request({ businessDay: payload.businessDay, action: 'reopen' }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rechaza jornadas futuras antes de modificar datos', async () => {
    expect((await PATCH(request({ ...payload, businessDay: '9999-01-01' }))).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
