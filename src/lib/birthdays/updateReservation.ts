import { birthdayYearRange } from "./calendar";
import { reservationFields } from "./reservation-input";
import { birthdayDay, birthdayToday, birthdayDateKey } from "./calendar";
import { lockBirthdayReservation, lockBirthdayDocument } from "./locking";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { signBirthdayClaim } from "./token";

export const reservationEditSchema = z
  .object({ ...reservationFields, expectedUpdatedAt: z.string().datetime() })
  .strict();

export async function updateBirthdayReservation(
  id: string,
  input: z.infer<typeof reservationEditSchema>,
  actor: string
) {
  return prisma.$transaction(
    async (tx) => {
      await lockBirthdayReservation(tx, id);
      const current = await tx.birthdayReservation.findUnique({
        where: { id },
        include: { inviteTokens: true, pack: true, courtesyItems: true },
      });
      if (!current) throw new Error("NOT_FOUND");
      const pack = await tx.birthdayPack.findUnique({ where: { id: input.packId } });
      if (!pack || (!pack.active && pack.id !== current.packId)) throw new Error("INVALID_PACK");
      const date = birthdayDay(input.date);
      const dateChanged = birthdayDateKey(current.date) !== input.date;
      const packChanged = current.packId !== input.packId;
      if (dateChanged && date < birthdayToday()) throw new Error("DATE_PAST");
      if (
        (dateChanged || packChanged) &&
        (current.hostArrivedAt ||
          current.guestArrivals > 0 ||
          current.courtesyItems.some((item) => item.status === "delivered") ||
          current.inviteTokens.some((t) => t.usedCount > 0))
      )
        throw new Error("ALREADY_USED");
      await lockBirthdayDocument(tx, input.documento, date.year);
      const duplicate =
        current.status !== "canceled"
          ? await tx.birthdayReservation.findFirst({
              where: {
                id: { not: id },
                documento: input.documento,
                date: birthdayYearRange(date.toJSDate()),
                status: { not: "canceled" },
              },
            })
          : null;
      if (duplicate) throw new Error("DUPLICATE_RESERVATION");
      const { expectedUpdatedAt, ...fields } = input;
      let specialBottle = current.specialBottle;
      if (dateChanged || packChanged) {
        const config =
          date.weekday === 3 && pack.priceSoles === 0
            ? await tx.systemConfig.findUnique({
                where: { id: 1 },
                select: { wednesdaySpecialBottle: true },
              })
            : null;
        specialBottle = config?.wednesdaySpecialBottle || null;
      }
      const changed = await tx.birthdayReservation.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data: {
          ...fields,
          email: input.email || null,
          date: date.toJSDate(),
          updatedBy: actor,
          specialBottle,
        },
      });
      if (!changed.count) throw new Error("EDIT_CONFLICT");
      for (const token of current.inviteTokens) {
        const expiresAt = date.endOf("day").toJSDate();
        if (!dateChanged && !packChanged) continue;
        const claim = signBirthdayClaim({
          t: "birthday",
          rid: id,
          kind: token.kind === "host" ? "host" : "guest",
          code: token.code,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(expiresAt.getTime() / 1000),
        });
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
