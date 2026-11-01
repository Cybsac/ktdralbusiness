import { prisma } from "@/lib/prisma";
import { invitationDay, invitationToday, assertEventAvailable } from "./calendar";
import { lockEvent } from "./locking";
import { verifyInvitationClaim } from "./token";
export const findInvitationByCode = (code: string) =>
  prisma.specialInvitation.findUnique({ where: { code }, include: { event: true } });
export async function markArrival(code: string, validatedBy: string) {
  const reference = await prisma.specialInvitation.findUnique({
    where: { code },
    select: { eventId: true },
  });
  if (!reference) throw new Error("INVITATION_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, reference.eventId);
    const inv = await tx.specialInvitation.findUnique({
      where: { code },
      include: { event: true },
    });
    if (!inv) throw new Error("INVITATION_NOT_FOUND");
    if (inv.arrivedAt) throw new Error("ALREADY_ARRIVED");
    if (inv.status === "cancelled") throw new Error("INVITATION_CANCELLED");
    const now = new Date();
    assertEventAvailable(inv.event, now);
    if (invitationDay(inv.event.date) > invitationToday(now)) throw new Error("DATE_FUTURE");
    if (!inv.expiresAt || inv.expiresAt <= now) throw new Error("EXPIRED");
    let signed;
    try {
      signed = JSON.parse(inv.claim || "");
    } catch {
      throw new Error("INVALID_SIGNATURE");
    }
    const verified = verifyInvitationClaim(signed, { now });
    if (!verified.ok) throw new Error(verified.code);
    const claim = verified.payload;
    if (
      claim.eid !== inv.eventId ||
      claim.iid !== inv.id ||
      claim.code !== code ||
      claim.t !== "invitation" ||
      claim.exp !== Math.floor(inv.expiresAt.getTime() / 1000)
    )
      throw new Error("INVALID_SIGNATURE");
    if (
      inv.event.maxGuests != null &&
      (await tx.specialInvitation.count({
        where: { eventId: inv.eventId, arrivedAt: { not: null } },
      })) >= inv.event.maxGuests
    )
      throw new Error("CAPACITY_EXCEEDED");
    const result = await tx.specialInvitation.updateMany({
      where: { id: inv.id, arrivedAt: null, status: "confirmed" },
      data: { arrivedAt: now, validatedBy, status: "arrived" },
    });
    if (!result.count) throw new Error("INVITATION_CANCELLED");
    return tx.specialInvitation.findUniqueOrThrow({
      where: { id: inv.id },
      include: { event: true },
    });
  });
}
