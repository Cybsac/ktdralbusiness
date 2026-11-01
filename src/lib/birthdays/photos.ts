import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { lockBirthdayReservation } from "./locking";
export const birthdayPhotoSchema = z.object({
  kind: z.string().trim().min(1).max(120).default("group"),
  status: z.enum(["pending", "ready", "sent"]).default("pending"),
  url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value))
    .optional()
    .nullable(),
});
export type AttachPhotoPayload = {
  kind?: string;
  url?: string | null;
  status?: "pending" | "ready" | "sent";
};
export async function attachPhoto(
  reservationId: string,
  payload: AttachPhotoPayload,
  actor?: string
) {
  const fields = birthdayPhotoSchema.parse(payload);
  const photo = await prisma.$transaction(async (tx) => {
    await lockBirthdayReservation(tx, reservationId);
    const reservation = await tx.birthdayReservation.findUnique({
      where: { id: reservationId },
      select: { status: true },
    });
    if (!reservation) throw new Error("RESERVATION_NOT_FOUND");
    if (reservation.status === "canceled") throw new Error("RESERVATION_UNAVAILABLE");
    const previous = fields.url
      ? await tx.photoDeliverable.findFirst({
          where: { reservationId, kind: fields.kind, url: fields.url },
        })
      : null;
    return previous
      ? tx.photoDeliverable.update({ where: { id: previous.id }, data: { status: fields.status } })
      : tx.photoDeliverable.create({ data: { reservationId, ...fields, url: fields.url || null } });
  });
  await audit("birthday.attachPhoto", actor, {
    reservationId,
    kind: fields.kind,
    status: fields.status,
  });
  return photo;
}
