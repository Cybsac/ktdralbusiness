import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { signBirthdayIdentity } from "@/lib/birthdays/identity-proof";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/featureFlags", () => ({ isBirthdaysEnabledPublic: () => true }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/cors", () => ({ corsHeadersFor: () => ({}) }));
vi.mock("@/lib/birthdays/service", () => ({
  createReservation: mocks.create,
  parseDateStringToLima: () => ({}),
  limaDateTimeToJSDate: () => new Date("2030-01-01T00:00:00Z"),
}));
import { POST } from "@/app/api/birthdays/reservations/route";

describe("reserva pública: identidad", () => {
  it("conserva el nombre verificado y transmite el nombre elegido para la tarjeta", async () => {
    vi.stubEnv("TOKEN_SECRET", "test-only-secret");
    const identity = { documento: "12345678", name: "Ana Prueba", birthDate: "2000-01-01" };
    mocks.create.mockResolvedValueOnce({ id: "reservation", celebrantName: identity.name, phone: "912345678", documento: identity.documento, date: new Date("2030-01-01T00:00:00Z"), timeSlot: "20:00", pack: { id: "pack", name: "Pack", qrCount: 1 }, guestsPlanned: 1, status: "approved", createdAt: new Date("2030-01-01T00:00:00Z") });
    try {
      const request = new NextRequest("http://localhost/api/birthdays/reservations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ celebrantName: identity.name, cardName: "Anita", documento: identity.documento, birthDate: identity.birthDate, identityProof: signBirthdayIdentity(identity), phone: "912345678", date: "2030-01-01", timeSlot: "20:00", packId: "pack", guestsPlanned: 1, wantsPhotoSession: false }) });
      expect((await POST(request)).status).toBe(201);
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ celebrantName: identity.name, cardName: "Anita", documento: identity.documento }));
    } finally { vi.unstubAllEnvs(); vi.clearAllMocks(); }
  });
  it("rechaza datos manipulados antes de crear una reserva", async () => {
    const previous = process.env.TOKEN_SECRET;
    process.env.TOKEN_SECRET = "test-only-secret";
    try {
      const identity = { documento: "12345678", name: "Ana Prueba", birthDate: "2000-01-01" };
      const request = new NextRequest("http://localhost/api/birthdays/reservations", {
        method: "POST",
        body: JSON.stringify({
          celebrantName: "Otra Persona",
          documento: identity.documento,
          birthDate: identity.birthDate,
          identityProof: signBirthdayIdentity(identity),
          phone: "912345678",
          date: "2030-01-01",
          timeSlot: "20:00",
          packId: "pack",
          guestsPlanned: 1,
          wantsPhotoSession: false,
        }),
        headers: { "content-type": "application/json" },
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.TOKEN_SECRET;
      else process.env.TOKEN_SECRET = previous;
    }
  });
});
