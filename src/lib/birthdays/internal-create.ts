import { z } from "zod";
import { reservationCreateSchema, surpriseReservationCreateSchema } from "./reservation-input";
import { verifyBirthdayIdentity } from "./identity-proof";

const identity = { identityProof: z.string().min(1).max(512) };
export const internalBirthdayCreateSchema = z.union([
  reservationCreateSchema.extend(identity),
  surpriseReservationCreateSchema.extend(identity),
]);
export type InternalBirthdayCreate = z.infer<typeof internalBirthdayCreateSchema>;

export function validInternalBirthdayIdentity(input: InternalBirthdayCreate): boolean {
  if ("isSurprise" in input && input.isSurprise)
    return verifyBirthdayIdentity(
      {
        documento: input.organizerDni,
        name: input.organizerName,
        birthDate: input.organizerBirthDate,
      },
      input.identityProof
    );
  return Boolean(
    input.birthDate &&
    input.documento &&
    verifyBirthdayIdentity(
      { documento: input.documento, name: input.celebrantName, birthDate: input.birthDate },
      input.identityProof
    )
  );
}

/** Do not create records unreadable by an older production app sharing the development DB. */
export function surpriseCreationEnabled() {
  return (
    process.env.NODE_ENV === "production" || process.env.BIRTHDAY_SURPRISE_LOCAL_ENABLED === "1"
  );
}
