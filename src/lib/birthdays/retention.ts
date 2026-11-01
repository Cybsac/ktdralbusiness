import { birthdayExpiration } from "./calendar";
import { enqueueBirthdayCleanup, tryBirthdayStorageCleanup } from "./storage-cleanup";
import path from "path";
import fs from "fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
async function cleanStorage(cards: Array<{ storageKey: string | null }>, ids: string[]) {
  let filesRemoved = 0,
    cleanupFailures = 0;
  const pending = await tryBirthdayStorageCleanup(
    cards.flatMap((card) => (card.storageKey ? [card.storageKey] : []))
  );
  filesRemoved += pending.removed;
  cleanupFailures += pending.failed;
  const base = path.resolve(process.cwd(), "public", "birthday-cards");
  for (const id of ids)
    for (const name of ["guest.png", "host.png"]) {
      const file = path.resolve(base, id, name);
      if (!file.startsWith(base + path.sep)) {
        cleanupFailures++;
        continue;
      }
      try {
        await fs.unlink(file);
        filesRemoved++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") cleanupFailures++;
      }
    }
  return { filesRemoved, cleanupFailures };
}
async function purge(ids: string[], complete: boolean, actor?: string, expiredAt?: Date) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length)
    return { purgedReservations: 0, cardsPurged: 0, filesRemoved: 0, cleanupFailures: 0 };
  const result = await prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`SELECT id,status FROM "BirthdayReservation" WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`
    );
    if (complete && reservations.some((row) => row.status !== "canceled"))
      throw new Error("RESERVATION_NOT_CANCELED");
    let found = reservations.map((row) => row.id);
    if (expiredAt) {
      const current = await tx.birthdayReservation.findMany({
        where: { id: { in: found } },
        include: { inviteTokens: { select: { expiresAt: true } } },
      });
      found = current
        .filter(
          (row) =>
            row.status === "canceled" ||
            (birthdayExpiration(row.date) <= expiredAt &&
              !row.inviteTokens.some((token) => token.expiresAt > expiredAt))
        )
        .map((row) => row.id);
    }
    const cards = await tx.inviteTokenCard.findMany({
      where: { inviteToken: { reservationId: { in: found } } },
      select: { storageKey: true },
    });
    await enqueueBirthdayCleanup(
      tx,
      cards.flatMap((card) => (card.storageKey ? [card.storageKey] : []))
    );
    await tx.inviteTokenCard.deleteMany({
      where: { inviteToken: { reservationId: { in: found } } },
    });
    if (complete) {
      await tx.tokenRedemption.deleteMany({
        where: {
          OR: [{ reservationId: { in: found } }, { token: { reservationId: { in: found } } }],
        },
      });
      await tx.inviteToken.deleteMany({ where: { reservationId: { in: found } } });
      await tx.courtesyItem.deleteMany({ where: { reservationId: { in: found } } });
      await tx.photoDeliverable.deleteMany({ where: { reservationId: { in: found } } });
      await tx.birthdayReservation.deleteMany({ where: { id: { in: found }, status: "canceled" } });
    }
    return { ids: found, cards };
  });
  const storage = await cleanStorage(result.cards, result.ids);
  await audit(complete ? "birthday.purgeReservations" : "birthday.purgeCards", actor, {
    reservationIds: result.ids,
    ...storage,
  });
  return {
    purgedReservations: complete ? result.ids.length : 0,
    cardsPurged: result.cards.length,
    ...storage,
  };
}
export const purgeBirthdayCards = (ids: string[], actor?: string, expiredAt?: Date) =>
  purge(ids, false, actor, expiredAt);
export const purgeReservations = (ids: string[], actor?: string) => purge(ids, true, actor);
