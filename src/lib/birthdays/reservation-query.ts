import { birthdayStoredRange } from "./calendar";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { BIRTHDAY_POLICY as P } from "./policy";
import { universalInvitation } from "./universal";
import type { ListReservationFilters, Pagination, ReservationWithRelations } from "./types";
const include = {
  pack: true,
  inviteTokens: true,
  courtesyItems: true,
  photoDeliveries: true,
  createdByUser: { select: { id: true, username: true, person: { select: { name: true } } } },
} as const;
export async function listReservations(
  filters: ListReservationFilters = {},
  pagination: Pagination = {}
) {
  const page = Math.max(1, Math.floor(pagination.page || 1)),
    pageSize = Math.min(P.maxPageSize, Math.max(1, Math.floor(pagination.pageSize || P.pageSize)));
  const where: Prisma.BirthdayReservationWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.packId) where.packId = filters.packId;
  if (filters.dateFrom || filters.dateTo)
    where.date = {
      ...(filters.dateFrom ? { gte: birthdayStoredRange(filters.dateFrom).gte } : {}),
      ...(filters.dateTo ? { lte: birthdayStoredRange(filters.dateTo).lte } : {}),
    };
  if (filters.search?.trim())
    where.OR = ["celebrantName", "phone", "documento"].map((field) => ({
      [field]: { contains: filters.search!.trim(), mode: "insensitive" },
    }));
  const total = await prisma.birthdayReservation.count({ where });
  const orderBy: Prisma.BirthdayReservationOrderByWithRelationInput[] =
    pagination.sortBy === "date"
      ? [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
  let items: ReservationWithRelations[];
  const skip = (page - 1) * pageSize;
  if (pagination.sortBy)
    items = await prisma.birthdayReservation.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include,
    });
  else {
    const preferred = { AND: [where, { status: { in: ["approved", "completed"] } }] },
      other = { AND: [where, { status: { notIn: ["approved", "completed"] } }] };
    const count = await prisma.birthdayReservation.count({ where: preferred });
    const first =
      skip < count
        ? await prisma.birthdayReservation.findMany({
            where: preferred,
            orderBy,
            skip,
            take: Math.min(pageSize, count - skip),
            include,
          })
        : [];
    const rest =
      first.length < pageSize
        ? await prisma.birthdayReservation.findMany({
            where: other,
            orderBy,
            skip: Math.max(0, skip - count),
            take: pageSize - first.length,
            include,
          })
        : [];
    items = [...first, ...rest];
  }
  const tokenIds = items.flatMap((item) => {
    const token = universalInvitation(item.inviteTokens);
    return token ? [token.id] : [];
  });
  const cards = tokenIds.length
    ? await prisma.inviteTokenCard.findMany({
        where: { inviteTokenId: { in: tokenIds } },
        select: { inviteTokenId: true },
      })
    : [];
  const available = new Set(cards.map((card) => card.inviteTokenId));
  return {
    items: items.map((item) => ({
      ...item,
      cardsReady: available.has(universalInvitation(item.inviteTokens)?.id || ""),
      hostArrivedAt: item.hostArrivedAt?.toISOString() || null,
      guestArrivals: item.guestArrivals || 0,
    })),
    total,
    page,
    pageSize,
  };
}
