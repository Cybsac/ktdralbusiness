import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), allow: vi.fn(), lookup: vi.fn(), challenge: vi.fn() }));
vi.mock("@/lib/users/access", () => ({ requireUserActor: mocks.actor }));
vi.mock("@/lib/cluzter/limit", () => ({ allowEmployeeLookup: mocks.allow }));
vi.mock("@/lib/security/turnstile", () => ({ verifyPublicChallenge: mocks.challenge }));
vi.mock("@/lib/cluzter/dni", () => ({ lookupDni: mocks.lookup }));
import { POST as adminPost } from "@/app/api/admin/users/dni-lookup/route";
import { POST as publicPost } from "@/app/api/user/auth/dni-lookup/route";
import { UserManagementError } from "@/lib/users/http";
const request = (dni: string) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dni, documentType: "DNI" }),
  });
describe("consulta de DNI de colaboradores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ userId: "admin", role: "ADMIN" });
    mocks.allow.mockResolvedValue(true);
    mocks.challenge.mockResolvedValue(true);
    mocks.lookup.mockResolvedValue({
      names: "Ana",
      paternalSurname: "Prueba",
      maternalSurname: "Ejemplo",
      birthDate: "2000-01-01",
      documentSexCode: "2",
    });
  });
  it("protege la consulta administrativa", async () => {
    mocks.actor.mockRejectedValueOnce(new UserManagementError("UNAUTHORIZED", 401));
    expect((await adminPost(request("12345678"))).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("valida el DNI sin consultar al proveedor", async () => {
    expect((await adminPost(request("123"))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it.each(["CE", "OTHER"])(
    "rechaza %s incluso con ocho dígitos sin consultar",
    async (documentType) => {
      const req = new Request("http://localhost/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dni: "12345678", documentType }),
      });
      expect((await publicPost(req)).status).toBe(400);
      expect(mocks.lookup).not.toHaveBeenCalled();
    }
  );
  it("rechaza consultas sin tipo de documento explícito", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dni: "12345678" }),
    });
    expect((await publicPost(req)).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("limita la consulta abierta antes de llamar al proveedor", async () => {
    mocks.allow.mockResolvedValueOnce(false);
    expect((await publicPost(request("12345678"))).status).toBe(429);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("rechaza consultas públicas sin verificación válida", async () => {
    mocks.challenge.mockResolvedValueOnce(false);
    expect((await publicPost(request("12345678"))).status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("aplica límites global y por origen al autorregistro", async () => {
    const res = await publicPost(request("12345678"));
    expect(res.status).toBe(200);
    expect(mocks.allow).toHaveBeenCalledWith("global", "global");
    expect(mocks.allow).toHaveBeenCalledWith("unknown", "public");
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });
  it("devuelve solo los campos necesarios", async () => {
    const res = await adminPost(request("12345678"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: "Ana Prueba Ejemplo",
      displayName: "Ana Prueba",
      birthday: "2000-01-01",
      documentSexCode: "2",
    });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
