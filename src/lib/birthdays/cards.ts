import { assertBirthdayCardAvailable } from "./card-policy";
import { enqueueBirthdayCleanup, tryBirthdayStorageCleanup } from "./storage-cleanup";
import { BIRTHDAY_POLICY as P } from "./policy";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { writeFile, unlink } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { uploadFileToSupabase, BIRTHDAY_CARDS_BUCKET } from "@/lib/supabase-server";
import { generateInviteCard } from "./generateInviteCard";
import { generateInviteTokens } from "./invitations";
import { universalInvitation } from "./universal";
import { lockBirthdayReservation } from "./locking";
export async function ensureBirthdayCards(
  reservationId: string,
  baseUrl: string,
  options: { regenerate?: boolean } = {}
) {
  const tokens = await generateInviteTokens(reservationId);
  const token = universalInvitation(tokens);
  if (!token) throw new Error("MISSING_GUEST_TOKEN");
  const reservation = await prisma.birthdayReservation.findUniqueOrThrow({
    where: { id: reservationId },
  });
  assertBirthdayCardAvailable(reservation);
  const previous = await prisma.inviteTokenCard.findUnique({ where: { inviteTokenId: token.id } });
  const priorUrl =
    previous?.storageUrl ||
    (previous?.filePath ? `/${previous.filePath.replace(/^[\/]+/, "")}` : null);
  if (previous && !options.regenerate && priorUrl)
    return { already: true, paths: { guest: priorUrl } };
  const buffer = await generateInviteCard(
    "guest",
    token.code,
    `${baseUrl}/b/${encodeURIComponent(token.code)}`,
    "png",
    reservation.celebrantName,
    reservation.date.toISOString()
  );
  const temp = path.join(tmpdir(), `birthday-card-${randomUUID()}.png`);
  const storageKey = `${reservationId}/guest-${randomUUID()}.png`;
  await enqueueBirthdayCleanup(prisma, [storageKey], new Date(Date.now() + P.cleanupLeaseMs));
  let uploaded: Awaited<ReturnType<typeof uploadFileToSupabase>>;
  try {
    await writeFile(temp, new Uint8Array(buffer));
    uploaded = await uploadFileToSupabase(temp, storageKey, BIRTHDAY_CARDS_BUCKET);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    try {
      await enqueueBirthdayCleanup(prisma, [storageKey]);
    } catch {
      /* The pre-upload cleanup intent is already durable. */
    }
    await tryBirthdayStorageCleanup([storageKey]);
    throw error;
  }
  let committed = false;
  try {
    const card = await prisma.$transaction(async (tx) => {
      await lockBirthdayReservation(tx, reservationId);
      const current = await tx.birthdayReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      assertBirthdayCardAvailable(current);
      if (
        current.celebrantName !== reservation.celebrantName ||
        current.date.getTime() !== reservation.date.getTime()
      )
        throw new Error("CARD_DATA_CHANGED");
      const latest = await tx.inviteTokenCard.findUnique({ where: { inviteTokenId: token.id } });
      if ((latest?.storageKey || null) !== (previous?.storageKey || null)) {
        if (latest?.storageUrl) return latest;
        throw new Error("CARD_DATA_CHANGED");
      }
      const data = {
        kind: "guest",
        filePath: null,
        storageProvider: "supabase",
        storageKey: uploaded.storageKey,
        storageUrl: uploaded.url,
        createdAt: new Date(),
      };
      const owned = await tx.birthdayStorageCleanup.deleteMany({
        where: { storageKey: uploaded.storageKey, attempts: 0 },
      });
      if (owned.count !== 1) throw new Error("CARD_DATA_CHANGED");
      if (previous?.storageKey) await enqueueBirthdayCleanup(tx, [previous.storageKey]);
      return tx.inviteTokenCard.upsert({
        where: { inviteTokenId: token.id },
        create: { inviteTokenId: token.id, ...data },
        update: data,
      });
    });
    committed = card.storageKey === uploaded.storageKey;
    await tryBirthdayStorageCleanup(previous?.storageKey ? [previous.storageKey] : []);
    return { already: !committed, paths: { guest: card.storageUrl! } };
  } finally {
    if (!committed) {
      try {
        await enqueueBirthdayCleanup(prisma, [uploaded.storageKey]);
      } catch (error) {
        console.warn("Uploaded birthday card remains queued for cleanup", error);
      }
      await tryBirthdayStorageCleanup([uploaded.storageKey]);
    }
  }
}
export async function getBirthdayCards(reservationId: string) {
  const tokens = await prisma.inviteToken.findMany({
    where: { reservationId },
    orderBy: { createdAt: "asc" },
  });
  const token = universalInvitation(tokens);
  const card = token
    ? await prisma.inviteTokenCard.findUnique({ where: { inviteTokenId: token.id } })
    : null;
  const url =
    card?.storageUrl || (card?.filePath ? `/${card.filePath.replace(/^[\/]+/, "")}` : null);
  return { paths: url ? { guest: url } : {}, tokens };
}
