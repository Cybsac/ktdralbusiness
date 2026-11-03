import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPrizeOperator } from '@/lib/prize-authorization/service';
import { birthdayDay, birthdayStoredRange } from '@/lib/birthdays/calendar';
import { BIRTHDAY_POLICY } from '@/lib/birthdays/policy';
import { reservationFields } from '@/lib/birthdays/reservation-input';
import { BIRTHDAY_RESERVATION_SOURCES } from '@/lib/birthdays/attribution';

export const dynamic = 'force-dynamic';
const querySchema = z.object({
  dateFrom: reservationFields.date.optional(), dateTo: reservationFields.date.optional(),
  dateField: z.enum(['date', 'createdAt']).default('date'),
  status: z.enum(BIRTHDAY_POLICY.statuses).optional(),
  source: z.enum([...BIRTHDAY_RESERVATION_SOURCES, 'UNRECORDED']).optional(),
  creator: z.union([z.literal('unrecorded'), z.string().startsWith('user:').min(6).max(205)]).optional(),
  packId: z.string().min(1).max(200).optional(), search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['date', 'arrival']).default('date'), sortDirection: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
});
export async function GET(request: NextRequest) {
  try {
    const actor = await getPrizeOperator(request);
    if (!actor || actor.role !== 'ADMIN') return NextResponse.json({ error: 'Acceso restringido a administradores.' }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success || (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo))
      return NextResponse.json({ error: 'Selecciona filtros y fechas válidos.' }, { status: 400 });
    const { dateFrom, dateTo, dateField, status, source, creator, packId, search, page, sortBy, sortDirection } = parsed.data;
    const where: Prisma.BirthdayReservationWhereInput = {};
    if (status) where.status = status;
    if (packId) where.packId = packId;
    if (creator === 'unrecorded') where.createdByUserId = null;
    else if (creator) where.createdByUserId = creator.slice('user:'.length);
    if (source === 'UNRECORDED') where.reservationSource = null;
    else if (source) where.reservationSource = source;
    if (search) where.OR = ['celebrantName', 'documento', 'phone'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } }));
    if (dateFrom || dateTo) {
      if (dateField === 'date') where.date = { ...(dateFrom && { gte: birthdayStoredRange(dateFrom).gte }), ...(dateTo && { lte: birthdayStoredRange(dateTo).lte }) };
      else where.createdAt = { ...(dateFrom && { gte: birthdayDay(dateFrom).toJSDate() }), ...(dateTo && { lt: birthdayDay(dateTo).plus({ days: 1 }).toJSDate() }) };
    }
    const orderBy: Prisma.BirthdayReservationOrderByWithRelationInput[] = sortBy === 'arrival'
      ? [{ hostArrivedAt: { sort: sortDirection, nulls: sortDirection === 'desc' ? 'last' : 'first' } }, { date: 'desc' }, { id: 'desc' }]
      : [{ date: sortDirection }, { id: sortDirection }];
    const [total, statuses, sums, arrived, items, packs, creators] = await prisma.$transaction([
      prisma.birthdayReservation.count({ where }),
      prisma.birthdayReservation.groupBy({ by: ['status'], where, orderBy: { status: 'asc' }, _count: { _all: true } }),
      prisma.birthdayReservation.aggregate({ where, _sum: { guestsPlanned: true, guestArrivals: true } }),
      prisma.birthdayReservation.count({ where: { AND: [where, { hostArrivedAt: { not: null } }] } }),
      prisma.birthdayReservation.findMany({ where, orderBy, skip: (page - 1) * BIRTHDAY_POLICY.pageSize, take: BIRTHDAY_POLICY.pageSize,
        select: { id: true, celebrantName: true, documento: true, phone: true, date: true, createdAt: true, timeSlot: true, status: true, reservationSource: true, guestsPlanned: true, guestArrivals: true, hostArrivedAt: true, wantsPhotoSession: true, pack: { select: { name: true } }, referrer: { select: { name: true } }, createdByUser: { select: { username: true, person: { select: { name: true } } } } } }),
      prisma.birthdayPack.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { birthdayReservationsCreated: { some: {} } }, select: { id: true, username: true, person: { select: { name: true } } } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const creatorOptions = creators.map(user => ({ id: user.id, name: user.person?.name || user.username, username: user.username })).sort((a, b) => a.name.localeCompare(b.name, 'es') || a.username.localeCompare(b.username, 'es'));
    return NextResponse.json({ total, page, pageSize: BIRTHDAY_POLICY.pageSize, statuses, guestsPlanned: sums._sum.guestsPlanned ?? 0, guestArrivals: sums._sum.guestArrivals ?? 0, hostsArrived: arrived, items, packs, creators: creatorOptions }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { console.error('Error loading birthday summary:', error); return NextResponse.json({ error: 'No se pudo cargar el consolidado.' }, { status: 500 }); }
}
