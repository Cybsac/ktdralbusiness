import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), daily: vi.fn(), weekly: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'session', verifyUserSessionCookie: mocks.session }));
vi.mock('@/lib/weekly-journey-stats', () => ({ getDailyJourneyDashboard: mocks.daily, getWeeklyJourneyDashboard: mocks.weekly }));
import { GET } from '@/app/api/admin/daily-evaluation/weekly-dashboard/route';

describe('consulta de evolución por fechas', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ role: 'COORDINATOR' }); mocks.daily.mockResolvedValue({ ok: true }); });
  it('consulta exactamente los días seleccionados', async () => {
    const response = await GET(new NextRequest('http://localhost/api/test?start=2026-01-29&end=2026-02-02'));
    expect(response.status).toBe(200);
    expect(mocks.daily).toHaveBeenCalledWith('2026-02-02', 5);
  });
  it('rechaza intervalos inválidos antes de consultar', async () => {
    const response = await GET(new NextRequest('http://localhost/api/test?start=2026-02-30&end=2026-03-02'));
    expect(response.status).toBe(400);
    expect(mocks.daily).not.toHaveBeenCalled();
  });
  it('mantiene el permiso de coordinación y administración', async () => {
    mocks.session.mockResolvedValue({ role: 'STAFF' });
    const response = await GET(new NextRequest('http://localhost/api/test?start=2026-01-01&end=2026-01-02'));
    expect(response.status).toBe(401);
    expect(mocks.daily).not.toHaveBeenCalled();
  });
});
