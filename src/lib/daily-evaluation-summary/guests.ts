import { prisma } from '@/lib/prisma';
import type { SummaryWindow } from './window';
import { birthdayStoredRange } from '@/lib/birthdays/calendar';
import { BIRTHDAY_POLICY } from '@/lib/birthdays/policy';

export async function guests({ fStart, calendarEndUtc }: SummaryWindow) {
// Birthday reservations for this day
const birthdayReservations = await prisma.birthdayReservation.findMany({
  where: {
    date: birthdayStoredRange(fStart),
    status: { not: 'canceled' },
  },
  select: {
    id: true,
    celebrantName: true,
    timeSlot: true,
    status: true,
    guestsPlanned: true,
    guestArrivals: true,
    hostArrivedAt: true,
    wantsPhotoSession: true,
    pack: { select: { name: true } },
  },
  orderBy: { timeSlot: 'asc' },
});

const approvedReservations = birthdayReservations.filter(r => (BIRTHDAY_POLICY.entryStatuses as readonly string[]).includes(r.status));
const packs = new Map<string, { name: string; count: number }>();
for (const reservation of approvedReservations) {
  const name = reservation.pack?.name || 'Sin pack';
  const entry = packs.get(name) ?? { name, count: 0 };
  entry.count++;
  packs.set(name, entry);
}
const birthdaySummary = {
  approvedTotal: approvedReservations.length,
  approvedArrived: approvedReservations.filter(r => r.hostArrivedAt).length,
  approvedGuests: approvedReservations.reduce((sum, r) => sum + r.guestsPlanned, 0),
  approvedGuestArrivals: approvedReservations.reduce((sum, r) => sum + r.guestArrivals, 0),
  pendingReview: birthdayReservations.filter(r => r.status === 'pending_review').length,
  draftCount: birthdayReservations.filter(r => r.status === 'draft').length,
  packs: [...packs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  total: birthdayReservations.length,
  arrived: birthdayReservations.filter(r => r.hostArrivedAt).length,
  totalGuests: birthdayReservations.reduce((s, r) => s + r.guestsPlanned, 0),
  arrivedGuests: birthdayReservations.reduce((s, r) => s + r.guestArrivals, 0),
  reservations: birthdayReservations.map(r => ({
    id: r.id,
    celebrantName: r.celebrantName,
    timeSlot: r.timeSlot,
    status: r.status,
    guestsPlanned: r.guestsPlanned,
    guestArrivals: r.guestArrivals,
    hostArrived: !!r.hostArrivedAt,
    wantsPhotoSession: r.wantsPhotoSession,
    packName: r.pack?.name ?? null,
  })),
};

// Special event invitations for this day
const specialEvents = await prisma.specialEvent.findMany({
  where: {
    date: { gte: fStart, lt: calendarEndUtc },
    status: { not: 'cancelled' },
  },
  select: {
    id: true,
    name: true,
    timeSlot: true,
    invitations: {
      where: { status: { not: 'cancelled' } },
      select: {
        id: true,
        guestName: true,
        guestCategory: true,
        status: true,
        arrivedAt: true,
      },
    },
  },
  orderBy: { timeSlot: 'asc' },
});

const allInvitations = specialEvents.flatMap(e =>
  e.invitations.map(inv => ({
    ...inv,
    eventName: e.name,
    eventTime: e.timeSlot,
    arrivedAt: inv.arrivedAt?.toISOString() ?? null,
  }))
);
const arrivedInvitations = allInvitations.filter(i => i.status === 'arrived');
const lastArrival = arrivedInvitations.length > 0
  ? arrivedInvitations.reduce((latest, i) => {
      if (!latest || (i.arrivedAt && i.arrivedAt > latest)) return i.arrivedAt;
      return latest;
    }, null as string | null)
  : null;

const specialGuestsSummary = {
  total: allInvitations.length,
  arrived: arrivedInvitations.length,
  lastArrivalAt: lastArrival,
  events: specialEvents.map(e => ({
    id: e.id,
    name: e.name,
    timeSlot: e.timeSlot,
    totalGuests: e.invitations.length,
    arrivedGuests: e.invitations.filter(i => i.status === 'arrived').length,
  })),
  guests: allInvitations.map(i => ({
    id: i.id,
    guestName: i.guestName,
    guestCategory: i.guestCategory,
    status: i.status,
    arrivedAt: i.arrivedAt,
    eventName: i.eventName,
    eventTime: i.eventTime,
  })),
};
  return { birthdays: birthdaySummary, specialGuests: specialGuestsSummary };
}
