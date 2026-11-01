import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { lockBirthdayReservation } from "./locking";
import { BIRTHDAY_POLICY as P } from "./policy";
export async function setCourtesyStatus(
  reservationId: string,
  type: string,
  status: "pending" | "delivered",
  actor?: string
) {
  const normalized = type.trim();
  if (!normalized || normalized.length > 120) throw new Error("INVALID_TYPE");
  const item = await prisma.$transaction(async (tx) => {
    await lockBirthdayReservation(tx, reservationId);
    const r = await tx.birthdayReservation.findUnique({
      where: { id: reservationId },
      include: { pack: true },
    });
    if (!r) throw new Error("RESERVATION_NOT_FOUND");
    if (!(P.entryStatuses as readonly string[]).includes(r.status))
      throw new Error("RESERVATION_UNAVAILABLE");
    const existing = await tx.courtesyItem.findFirst({
      where: { reservationId, type: normalized },
    });
    let perks: unknown = [];
    try {
      perks = JSON.parse(r.pack.perks || "[]");
    } catch {}
    const included =
      existing ||
      (normalized === "bottle" && (r.specialBottle || r.pack.bottle)) ||
      (normalized === "photo" && r.wantsPhotoSession) ||
      (Array.isArray(perks) &&
        perks.some((perk) => typeof perk === "string" && perk.trim() === normalized));
    if (!included) throw new Error("COURTESY_NOT_INCLUDED");
    return existing
      ? tx.courtesyItem.update({ where: { id: existing.id }, data: { status } })
      : tx.courtesyItem.create({ data: { reservationId, type: normalized, status } });
  });
  await audit("birthday.setCourtesyStatus", actor, { reservationId, type: normalized, status });
  return item;
}
