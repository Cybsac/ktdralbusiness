import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signBirthdayIdentity } from "@/lib/birthdays/identity-proof";

const mocks = vi.hoisted(() => ({ manager: vi.fn(), session: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/birthdays/managementAuth", () => ({ birthdayManager: mocks.manager }));
vi.mock("@/lib/auth", () => ({ getUserSessionCookieFromRequest: () => "session", verifyUserSessionCookie: mocks.session }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/birthdays/service", () => ({ createReservation: mocks.create, parseDateStringToLima: () => ({}), limaDateTimeToJSDate: () => new Date("2030-01-01T00:00:00Z") }));
import { POST as adminPost } from "@/app/api/admin/birthdays/route";
import { POST as staffPost } from "@/app/api/pedidos/birthdays/route";

describe("identidad de reservas internas", () => {
  const identity = { documento: "12345678", name: "Ana Prueba", birthDate: "2000-01-01" };
  const previous = process.env.TOKEN_SECRET;
  const request = (proof: string, name = identity.name) => new NextRequest("http://localhost/api/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ celebrantName: name, documento: identity.documento, birthDate: identity.birthDate, identityProof: proof, phone: "912345678", date: "2030-01-01", timeSlot: "20:00", packId: "pack", guestsPlanned: 1 }) });
  beforeEach(() => { vi.clearAllMocks(); process.env.TOKEN_SECRET = "test-only-secret"; mocks.manager.mockResolvedValue({ role: "ADMIN", userId: "admin" }); mocks.session.mockResolvedValue({ role: "STAFF", userId: "staff" }); });
  afterEach(() => { if (previous === undefined) delete process.env.TOKEN_SECRET; else process.env.TOKEN_SECRET = previous; });
  it.each([adminPost, staffPost])("rechaza datos modificados antes de guardar", async post => {
    const result = await post(request(signBirthdayIdentity(identity)!, "Otro Nombre"));
    expect(result.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([adminPost, staffPost])("rechaza peticiones sin permiso", async post => {
    mocks.manager.mockResolvedValue(null); mocks.session.mockResolvedValue(null);
    const result = await post(request(signBirthdayIdentity(identity)!));
    expect(result.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([adminPost, staffPost])("acepta la identidad consultada con permiso", async post => {
    mocks.create.mockResolvedValue({ id: "reserva", celebrantName: identity.name, documento: identity.documento, phone: "912345678", date: new Date("2030-01-01T00:00:00Z"), createdAt: new Date("2030-01-01T00:00:00Z"), pack: { id: "pack", name: "Pack", qrCount: 1 }, guestsPlanned: 1, status: "approved" });
    const result = await post(request(signBirthdayIdentity(identity)!));
    expect(result.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ documento: identity.documento, celebrantName: identity.name, birthDate: identity.birthDate }));
  });
});
