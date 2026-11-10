import { describe, expect, it, vi } from "vitest";
import { reservationCreateSchema } from "@/lib/birthdays/reservation-input";
import {
  internalBirthdayCreateSchema,
  validInternalBirthdayIdentity,
} from "@/lib/birthdays/internal-create";
import { signBirthdayIdentity } from "@/lib/birthdays/identity-proof";

describe("reservas sorpresa", () => {
  it("verifica al organizador y mantiene separado al cumpleañero", () => {
    vi.stubEnv("TOKEN_SECRET", "surprise-test-secret");
    const identity = { documento: "12345678", name: "Ana Perez", birthDate: "1990-01-01" };
    const input = {
      isSurprise: true,
      documento: null,
      organizerDni: identity.documento,
      organizerName: identity.name,
      organizerBirthDate: identity.birthDate,
      identityProof: signBirthdayIdentity(identity),
      celebrantName: "Luis",
      cardName: "Luis",
      phone: "987654321",
      date: "2030-05-01",
      timeSlot: "20:00",
      packId: "pack",
      guestsPlanned: 1,
    };
    const parsed = internalBirthdayCreateSchema.parse(input);
    expect(validInternalBirthdayIdentity(parsed)).toBe(true);
    expect(
      validInternalBirthdayIdentity({ ...parsed, organizerDni: "87654321" } as typeof parsed)
    ).toBe(false);
    expect(
      internalBirthdayCreateSchema.safeParse({ ...input, cardName: "Luis Rojas" }).success
    ).toBe(false);
    expect(internalBirthdayCreateSchema.safeParse({ ...input, birthDate: "1999-01-01" }).success).toBe(false);
    expect(reservationCreateSchema.safeParse(input).success).toBe(false);
    vi.unstubAllEnvs();
  });
});
