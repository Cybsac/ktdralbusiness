import { afterEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  scan: { findMany: vi.fn() }, dailyEvaluation: { findMany: vi.fn() },
  reusableTokenRedemption: { findMany: vi.fn() }, token: { findMany: vi.fn() },
  birthdayReservation: { findMany: vi.fn() }, reusableToken: { aggregate: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getDailyJourneyDashboard } from '@/lib/weekly-journey-stats';

describe('evolución por jornada', () => {
  const previous = process.env.ATTENDANCE_CUTOFF_HOUR;
  afterEach(() => { if (previous === undefined) delete process.env.ATTENDANCE_CUTOFF_HOUR; else process.env.ATTENDANCE_CUTOFF_HOUR = previous; });
  it('asigna movimientos posteriores a medianoche a la jornada anterior', async () => {
    process.env.ATTENDANCE_CUTOFF_HOUR = '14';
    db.scan.findMany.mockResolvedValue([]); db.dailyEvaluation.findMany.mockResolvedValue([]);
    db.token.findMany.mockResolvedValue([]); db.birthdayReservation.findMany.mockResolvedValue([]);
    db.reusableToken.aggregate.mockResolvedValue({ _sum: { usedCount: 0 } });
    db.reusableTokenRedemption.findMany.mockResolvedValue([{ createdAt: new Date('2026-01-02T08:00:00Z'), token: { prize: { label: 'Producto' }, group: { name: 'Barra' } } }]);
    const result = await getDailyJourneyDashboard('2026-01-02', 2);
    expect(result.qrStats.map(day => day.reusableScans)).toEqual([1, 0]);
    expect(result.barProducts.weeks.map(day => day.total)).toEqual([1, 0]);
    expect(db.birthdayReservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-02T23:59:59.999Z') } }) }));
  });
});
