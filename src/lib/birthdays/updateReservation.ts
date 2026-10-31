import { DateTime } from "luxon";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { signBirthdayClaim } from "./token";

export const reservationEditSchema = z
  .object({
    celebrantName: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .refine((v) => v.split(/\s+/).length >= 2, "Ingresa nombre y apellido"),
    phone: z.string().regex(/^\d{9}$/),
    documento: z.string().regex(/^\d{8}$/),
    email: z.union([z.string().email(), z.literal(""), z.null()]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => DateTime.fromISO(v, { zone: "America/Lima" }).isValid),
    timeSlot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    packId: z.string().min(1),
    guestsPlanned: z.number().int().min(1).max(5000),
    wantsPhotoSession: z.boolean(),
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict();

export async function updateBirthdayReservation(
  id: string,
  input: z.infer<typeof reservationEditSchema>,
  actor: string
) {
  return prisma.$transaction(
    async (tx) => {
      const current = await tx.birthdayReservation.findUnique({
        where: { id },
        include: { inviteTokens: true, pack: true },
      });
      if (!current) throw new Error("NOT_FOUND");
      const pack = await tx.birthdayPack.findUnique({ where: { id: input.packId } });
      if (!pack || (!pack.active && pack.id !== current.packId)) throw new Error("INVALID_PACK");
      const date = DateTime.fromISO(input.date, { zone: "America/Lima" }).startOf("day");
      const dateChanged =
        new Date(current.date.getTime() - 5 * 3600000).toISOString().slice(0, 10) !== input.date;
      const packChanged = current.packId !== input.packId;
      if (dateChanged && date < DateTime.now().setZone("America/Lima").startOf("day"))
        throw new Error("DATE_PAST");
      if (
        (dateChanged || packChanged) &&
        (current.hostArrivedAt ||
          current.guestArrivals > 0 ||
          current.inviteTokens.some((t) => t.usedCount > 0))
      )
        throw new Error("ALREADY_USED");
      const duplicate = await tx.birthdayReservation.findFirst({
        where: {
          id: { not: id },
          documento: input.documento,
          date: {
            gte: date.startOf("year").toJSDate(),
            lt: date.plus({ years: 1 }).startOf("year").toJSDate(),
          },
          status: { not: "canceled" },
        },
      });
      if (duplicate) throw new Error("DUPLICATE_RESERVATION");
      const { expectedUpdatedAt, ...fields } = input;
      const changed = await tx.birthdayReservation.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data: { ...fields, email: input.email || null, date: date.toJSDate(), updatedBy: actor },
      });
      if (!changed.count) throw new Error("EDIT_CONFLICT");
      for (const token of current.inviteTokens) {
        const expiresAt = date.endOf("day").toJSDate();
        if (!dateChanged && !packChanged) continue;
        const claim = signBirthdayClaim({
          t: "birthday",
          rid: id,
          kind: token.kind,
          code: token.code,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(expiresAt.getTime() / 1000),
        } as any);
        await tx.inviteToken.update({
          where: { id: token.id },
          data: {
            ...(dateChanged ? { expiresAt, claim: JSON.stringify(claim) } : {}),
            ...(packChanged && token.kind === "guest"
              ? { maxUses: Math.max(1, pack.qrCount) }
              : {}),
          },
        });
      }
      return tx.birthdayReservation.findUnique({ where: { id } });
    },
    { isolationLevel: "Serializable" }
  );
}
