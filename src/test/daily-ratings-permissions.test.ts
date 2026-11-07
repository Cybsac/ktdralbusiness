import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ role: 'ADMIN' }));
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, dailyEvaluation: { findUnique: vi.fn() }, scan: { findMany: vi.fn() }, person: { findMany: vi.fn() }, personDailyRating: { findMany: vi.fn(), upsert: vi.fn() }, $transaction: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'cookie', verifyUserSessionCookie: async () => ({ userId: 'u', role: state.role }) }));
import { GET, POST } from '@/app/api/admin/daily-evaluation/ratings/route';
const request = (data: unknown) => new NextRequest('http://localhost/api/admin/daily-evaluation/ratings', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { vi.clearAllMocks(); state.role = 'ADMIN'; db.user.findUnique.mockResolvedValue({ role: 'ADMIN' }); db.$transaction.mockImplementation(async fn => fn(db)); db.dailyEvaluation.findUnique.mockResolvedValue(null); db.scan.findMany.mockResolvedValue([{ personId: 'p1' }]); db.person.findMany.mockResolvedValue([{ id: 'p1', name: 'Ana' }]); db.personDailyRating.findMany.mockResolvedValue([]); db.personDailyRating.upsert.mockResolvedValue({}); });
describe('permisos y validación de calificaciones', () => {
  it.each(['COLLAB', 'STAFF'])('impide consultar calificaciones para %s', async role => {
    state.role = role;
    const response = await GET(new NextRequest('http://localhost/api/admin/daily-evaluation/ratings?day=2025-01-01'));
    expect(response.status).toBe(403); expect(db.personDailyRating.findMany).not.toHaveBeenCalled();
  });
  it('permite a coordinación consultar las calificaciones', async () => {
    state.role = 'COORDINATOR';
    const response = await GET(new NextRequest('http://localhost/api/admin/daily-evaluation/ratings?day=2025-01-01'));
    expect(response.status).toBe(200);
  });
  it('rechaza elementos nulos y personas no presentes', async () => {
    expect((await POST(request({ businessDay: '2025-01-01', ratings: [null] }))).status).toBe(400);
    expect((await POST(request({ businessDay: '2025-01-01', ratings: [{ personId: 'p1', rating: 'BUENO' }, { personId: 'other', rating: 'BUENO' }] }))).status).toBe(400);
    expect(db.personDailyRating.upsert).not.toHaveBeenCalled();
  });
  it('guarda una evaluación válida para el equipo presente', async () => {
    expect((await POST(request({ businessDay: '2025-01-01', ratings: [{ personId: 'p1', rating: 'BUENO' }] }))).status).toBe(200);
    expect(db.personDailyRating.upsert).toHaveBeenCalledOnce();
  });
});
