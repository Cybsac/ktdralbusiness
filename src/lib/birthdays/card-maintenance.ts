import { prisma } from "@/lib/prisma";
import { supabaseAdmin, BIRTHDAY_CARDS_BUCKET } from "@/lib/supabase-server";
import { birthdayCardAvailable, birthdayCardsExpiredWhere } from "./card-policy";
import { birthdayExpiration } from "./calendar";
import { BIRTHDAY_POLICY as P } from "./policy";
import { purgeBirthdayCards } from "./retention";
import { enqueueBirthdayCleanup, processBirthdayStorageCleanup } from "./storage-cleanup";

let reservationCursor: string | undefined;
let scan = [{ prefix: "", offset: 0 }];
/** Bounded, repeatable sweep. No reservation, token or admission record is removed. */
export async function cleanupBirthdayCardsOnce(now = new Date()) {
  const reservations = await prisma.birthdayReservation.findMany({
    where: {
      ...birthdayCardsExpiredWhere(now),
      ...(reservationCursor ? { id: { gt: reservationCursor } } : {}),
      inviteTokens: { some: { card: { isNot: null } } },
    },
    orderBy: { id: "asc" },
    take: P.cleanupBatchSize,

    select: { id: true },
  });
  reservationCursor =
    reservations.length === P.cleanupBatchSize ? reservations.at(-1)!.id : undefined;
  let cardsPurged = 0;
  for (const reservation of reservations) {
    const result = await purgeBirthdayCards([reservation.id], undefined, now);
    cardsPurged += result.cardsPurged;
  }
  const storage = await processBirthdayStorageCleanup();
  const orphansQueued = await scanBirthdayStorageOnce(now);
  return { cardsPurged, orphansQueued, ...storage };
}

/** Incremental inventory of the dedicated cards bucket, including historical untracked images. */
export async function scanBirthdayStorageOnce(now = new Date()) {
  const page = scan[0] || { prefix: "", offset: 0 };
  const { data, error } = await supabaseAdmin.storage
    .from(BIRTHDAY_CARDS_BUCKET)
    .list(page.prefix, {
      limit: P.storageScanPageSize,
      offset: page.offset,
      sortBy: { column: "name", order: "asc" },
    });
  if (error) throw new Error(error.message || "STORAGE_LIST_FAILED");
  let queued = 0;
  for (const item of data || []) {
    const key = page.prefix ? `${page.prefix}/${item.name}` : item.name;
    if (!item.id) {
      scan.push({ prefix: key, offset: 0 });
      continue;
    }
    const created = new Date(item.created_at).getTime();
    if (!Number.isFinite(created) || now.getTime() - created < P.cleanupLeaseMs) continue;
    if (
      await prisma.inviteTokenCard.findFirst({ where: { storageKey: key }, select: { id: true } })
    )
      continue;
    const intent = await prisma.birthdayStorageCleanup.findUnique({ where: { storageKey: key } });
    if (intent && intent.nextAttemptAt > now) continue;
    const reservationId = key.split("/")[0];
    const reservation = await prisma.birthdayReservation.findUnique({
      where: { id: reservationId },
      include: { inviteTokens: { select: { expiresAt: true } } },
    });
    if (
      reservation &&
      (birthdayCardAvailable(reservation, now) ||
        (reservation.status !== "canceled" &&
          reservation.inviteTokens.some((token) => token.expiresAt > now)))
    )
      continue;
    // No reservation, canceled reservation, or fully expired celebration: an unreferenced file.
    if (
      reservation &&
      reservation.status !== "canceled" &&
      birthdayExpiration(reservation.date) > now
    )
      continue;
    await enqueueBirthdayCleanup(prisma, [key]);
    queued++;
  }
  if ((data || []).length < P.storageScanPageSize) scan.shift();
  else page.offset += P.storageScanPageSize;
  if (!scan.length) scan = [{ prefix: "", offset: 0 }];
  return queued;
}
