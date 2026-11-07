import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, person: { findMany: vi.fn() }, personDailyRating: { findMany: vi.fn() }, dailyEvaluation: { findMany: vi.fn() } }));
const auth = vi.hoisted(() => ({ session: true }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({
  getUserSessionCookieFromRequest: () => 'cookie',
  verifyUserSessionCookie: async () => auth.session ? { userId: 'u1', role: 'ADMIN' } : null,
}));
import { GET } from '@/app/api/user/me/performance/route';
import { GET as GET_TEAM } from '@/app/api/user/team-performance/route';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T20:00:00Z'));
  vi.clearAllMocks();
  auth.session = true;
  db.user.findUnique.mockResolvedValue({ personId: 'p1' });
  db.personDailyRating.findMany.mockResolvedValue([
    { businessDay: '2026-11-02', rating: 'BUENO' },
    { businessDay: '2026-10-30', rating: 'MUY_BUENO' },
    { businessDay: '2026-10-29', rating: 'INVALIDO' },
  ]);
  db.dailyEvaluation.findMany.mockResolvedValue([{ businessDay: '2026-11-02' }, { businessDay: '2026-10-30' }]);
});
afterEach(() => vi.useRealTimers());
describe('rendimiento del perfil', () => {
  it('calcula la semana y los últimos 30 días sin contar calificaciones inválidas', async () => {
    const response = await GET(new Request('http://localhost/api/user/me/performance'));
    const data = await response.json();
    expect(data.performance.week).toMatchObject({ averageScore: 3, level: 'BUENO', evaluatedDays: 1 });
    expect(data.performance.last30Days).toMatchObject({ averageScore: 3.5, level: 'MUY_BUENO', evaluatedDays: 2 });
    expect(data.performance.scale).toEqual({ min: 1, max: 4 });
  });
  it('requiere sesión antes de consultar información personal', async () => {
    auth.session = false;
    const response = await GET(new Request('http://localhost/api/user/me/performance'));
    expect(response.status).toBe(401);
    expect(db.personDailyRating.findMany).not.toHaveBeenCalled();
  });
  it('excluye calificaciones de jornadas reabiertas', async () => {
    db.dailyEvaluation.findMany.mockResolvedValue([{ businessDay: '2026-10-30' }]);
    const data = await (await GET(new Request('http://localhost/api/user/me/performance'))).json();
    expect(data.performance.week.evaluatedDays).toBe(0);
    expect(data.performance.last30Days).toMatchObject({ averageScore: 4, evaluatedDays: 1 });
  });
  it('calcula el promedio del equipo por calificación, no por número de días', async () => {
    db.person.findMany.mockResolvedValue([{ id: 'p1', name: 'Ana', code: '1', area: 'Caja', user: { role: 'STAFF' } }, { id: 'p2', name: 'Luis', code: '2', area: 'Caja', user: { role: 'STAFF' } }]);
    db.personDailyRating.findMany.mockResolvedValue([{ personId: 'p1', businessDay: '2026-11-02', rating: 'BUENO' }, { personId: 'p2', businessDay: '2026-11-02', rating: 'MUY_BUENO' }]);
    const data = await (await GET_TEAM(new Request('http://localhost/api/user/team-performance'))).json();
    expect(data.team.week).toMatchObject({ averageScore: 3.5, evaluatedDays: 1 });
  });
});
