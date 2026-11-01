import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ birthdayReservation: { findMany: vi.fn() }, specialEvent: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { guests } from '@/lib/daily-evaluation-summary/guests';
import { summaryWindow } from '@/lib/daily-evaluation-summary/window';

describe('indicadores de cumpleaños', () => {
  it('cuenta aprobadas y completadas, separa pendientes y usa llegada registrada', async () => {
    const base = { timeSlot: '22:00', wantsPhotoSession: false, pack: { name: 'Pack A' } };
    db.birthdayReservation.findMany.mockResolvedValue([
      { ...base, id: '1', celebrantName: 'Ana', status: 'approved', guestsPlanned: 5, guestArrivals: 2, hostArrivedAt: new Date('2025-01-02T03:00:00Z') },
      { ...base, id: '2', celebrantName: 'Eva', status: 'completed', guestsPlanned: 4, guestArrivals: 1, hostArrivedAt: null },
      { ...base, id: '3', celebrantName: 'Sol', status: 'pending_review', guestsPlanned: 10, guestArrivals: 0, hostArrivedAt: null },
      { ...base, id: '4', celebrantName: 'Luz', status: 'draft', guestsPlanned: 12, guestArrivals: 0, hostArrivedAt: null },
    ]);
    db.specialEvent.findMany.mockResolvedValue([]);
    const result = await guests(summaryWindow('2025-01-01'));
    expect(result.birthdays).toMatchObject({ approvedTotal: 2, approvedArrived: 1, approvedGuests: 9, approvedGuestArrivals: 3, pendingReview: 1, draftCount: 1, packs: [{ name: 'Pack A', count: 2 }] });
    expect(result.birthdays.reservations[1]).toMatchObject({ timeSlot: '22:00', status: 'completed', hostArrived: false });
    expect(db.birthdayReservation.findMany.mock.calls[0][0].where).toEqual({ date: { gte: new Date('2025-01-01T00:00:00.000Z'), lte: new Date('2025-01-01T23:59:59.999Z') }, status: { not: 'canceled' } });
  });
});
