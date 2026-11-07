import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { birthdayPack: { update: mocks.update } } }));
vi.mock("@/lib/birthdays/managementAuth", () => ({ birthdayPackAdministrator: mocks.admin }));
import { PATCH } from "@/app/api/admin/birthdays/packs/[id]/route";
import { birthdayPackDto } from "@/lib/birthdays/pack-catalog";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/birthdays/packs/a", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("administración de packs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ role: "ADMIN" });
  });
  it("rechaza acceso y datos inválidos antes de escribir", async () => {
    mocks.admin.mockResolvedValueOnce(null);
    expect((await PATCH(request({ name: "Nuevo" }), { params: { id: "a" } })).status).toBe(401);
    expect((await PATCH(request({ qrCount: -1 }), { params: { id: "a" } })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("guarda beneficios y devuelve el pack actualizado", async () => {
    mocks.update.mockResolvedValue({ id: "a", perks: '["Mesa"]' });
    const res = await PATCH(request({ perks: ["Mesa"], active: false }), { params: { id: "a" } });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { active: false, perks: '["Mesa"]' },
    });
    expect((await res.json()).pack.perks).toEqual(["Mesa"]);
  });
  it("distingue registros inexistentes de errores internos", async () => {
    mocks.update.mockRejectedValueOnce({ code: "P2025" });
    expect((await PATCH(request({ name: "A" }), { params: { id: "a" } })).status).toBe(404);
    mocks.update.mockRejectedValueOnce({ code: "P2002" });
    expect((await PATCH(request({ name: "A" }), { params: { id: "a" } })).status).toBe(409);
  });
  it("filtra beneficios históricos malformados", () => {
    expect(birthdayPackDto({ perks: '["Mesa",42,null]' }).perks).toEqual(["Mesa"]);
    expect(birthdayPackDto({ perks: "invalid" }).perks).toEqual([]);
  });
});
