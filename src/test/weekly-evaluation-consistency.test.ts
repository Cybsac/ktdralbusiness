import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ role: 'ADMIN' }));
const db = vi.hoisted(() => ({ dailyEvaluation: { findUnique: vi.fn() }, personDailyRating: { findMany: vi.fn() } }));
const parts = vi.hoisted(() => ({ attendance: vi.fn(), roulette: vi.fn(), guests: vi.fn(), reusable: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'cookie', verifyUserSessionCookie: async () => ({ userId: 'u', role: state.role }) }));
vi.mock('@/lib/daily-evaluation-summary/attendance', () => ({ attendance: parts.attendance }));
vi.mock('@/lib/daily-evaluation-summary/roulette', () => ({ roulette: parts.roulette }));
vi.mock('@/lib/daily-evaluation-summary/guests', () => ({ guests: parts.guests }));
vi.mock('@/lib/daily-evaluation-summary/reusable', () => ({ reusable: parts.reusable }));
import { GET } from '@/app/api/admin/weekly-evaluation/summary/route';
beforeEach(() => {
 vi.clearAllMocks(); state.role='ADMIN';
 parts.attendance.mockResolvedValue([]); parts.roulette.mockResolvedValue({ deliveredPrizes: [], totalDelivered: 2, totalTokensInBatches: 3 });
 parts.guests.mockResolvedValue({ birthdays: { total: 0 }, specialGuests: { total: 0 } });
 parts.reusable.mockResolvedValue([{ daySales: 4 }]); db.dailyEvaluation.findUnique.mockResolvedValue(null); db.personDailyRating.findMany.mockResolvedValue([]);
});
describe('resumen semanal', () => {
 it('reutiliza las mismas fuentes y métricas que el resumen diario', async () => {
  const response=await GET(new NextRequest('http://localhost/api/admin/weekly-evaluation/summary?week=2025-01-06'));
  expect(response.status).toBe(200); const result=await response.json();
  expect(result.days).toHaveLength(7); expect(result.days[0]).toMatchObject({ day:'2025-01-06', totalDelivered:2, totalReusableSales:4 });
  expect(parts.reusable).toHaveBeenCalledTimes(7);
 });
 it('rechaza fechas inexistentes', async () => {
  expect((await GET(new NextRequest('http://localhost/api/admin/weekly-evaluation/summary?week=2025-02-30'))).status).toBe(400);
  expect(parts.attendance).not.toHaveBeenCalled();
 });
});
