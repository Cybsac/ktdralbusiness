import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invitationToday } from "./calendar";
import { INVITATION_POLICY as P } from "./policy";
export async function listEvents(
  filters?: { status?: string; search?: string; dateFilter?: string },
  pagination?: { page?: number; pageSize?: number }
) {
  const where: Prisma.SpecialEventWhereInput = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { location: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters?.dateFilter && filters.dateFilter !== "all") {
    const limaNow = invitationToday();
    const todayStart = limaNow.startOf("day").toJSDate();
    const tomorrowStart = limaNow.plus({ days: 1 }).startOf("day").toJSDate();
    switch (filters.dateFilter) {
      case "upcoming":
        where.date = { gte: todayStart };
        break;
      case "past":
        where.date = { lt: todayStart };
        break;
      case "today":
        where.date = { gte: todayStart, lt: tomorrowStart };
        break;
    }
  }

  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.specialEvent.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { invitations: true } },
      },
    }),
    prisma.specialEvent.count({ where }),
  ]);

  // Enrich with arrival stats — single grouped query instead of N+1
  const arrivedGroups = await prisma.specialInvitation.groupBy({
    by: ["eventId"],
    where: { eventId: { in: items.map((i) => i.id) }, arrivedAt: { not: null } },
    _count: { id: true },
  });
  const arrivedMap = new Map(arrivedGroups.map((r) => [r.eventId, r._count.id]));

  const enriched = items.map((ev) => ({
    ...ev,
    invitationCount: ev._count.invitations,
    arrivedCount: arrivedMap.get(ev.id) ?? 0,
  }));

  return { items: enriched, total, page, pageSize };
}

export async function getEventStats(eventId: string) {
  const event = await prisma.specialEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("EVENT_NOT_FOUND");

  const [total, confirmed, arrived, cancelled, pending] = await Promise.all([
    prisma.specialInvitation.count({ where: { eventId } }),
    prisma.specialInvitation.count({ where: { eventId, status: "confirmed" } }),
    prisma.specialInvitation.count({ where: { eventId, status: "arrived" } }),
    prisma.specialInvitation.count({ where: { eventId, status: "cancelled" } }),
    prisma.specialInvitation.count({ where: { eventId, status: "pending" } }),
  ]);

  const withCode = await prisma.specialInvitation.count({
    where: { eventId, code: { not: null } },
  });

  return { eventId, total, confirmed, arrived, cancelled, pending, withCode };
}

export async function getGlobalInvitationStats() {
  const [totalEvents, activeEvents, completedEvents, cancelledEvents] = await Promise.all([
    prisma.specialEvent.count(),
    prisma.specialEvent.count({ where: { status: "active" } }),
    prisma.specialEvent.count({ where: { status: "completed" } }),
    prisma.specialEvent.count({ where: { status: "cancelled" } }),
  ]);

  const [
    totalInvitations,
    totalArrived,
    totalPending,
    totalConfirmed,
    totalCancelled,
    totalWithCode,
  ] = await Promise.all([
    prisma.specialInvitation.count(),
    prisma.specialInvitation.count({ where: { arrivedAt: { not: null } } }),
    prisma.specialInvitation.count({ where: { status: "pending" } }),
    prisma.specialInvitation.count({ where: { status: "confirmed" } }),
    prisma.specialInvitation.count({ where: { status: "cancelled" } }),
    prisma.specialInvitation.count({ where: { code: { not: null } } }),
  ]);

  // Upcoming events (next 30 days)
  const now = invitationToday().toJSDate();
  const in30 = new Date(now.getTime() + P.upcomingDays * 86400000);
  const upcomingEvents = await prisma.specialEvent.findMany({
    where: { date: { gte: now, lte: in30 }, status: "active" },
    orderBy: { date: "asc" },
    take: P.upcomingLimit,
    include: { _count: { select: { invitations: true } } },
  });

  return {
    totalEvents,
    activeEvents,
    completedEvents,
    cancelledEvents,
    totalInvitations,
    totalArrived,
    totalPending,
    totalConfirmed,
    totalCancelled,
    totalWithCode,
    arrivalRate: totalInvitations > 0 ? Math.round((totalArrived / totalInvitations) * 100) : 0,
    upcomingEvents,
  };
}
