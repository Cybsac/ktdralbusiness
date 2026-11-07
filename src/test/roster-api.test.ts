import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), lock: vi.fn(), role: vi.fn(), person: vi.fn(), existing: vi.fn(), create: vi.fn(), update: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: m.actor }));
vi.mock("@/lib/prisma", () => {
  const tx = { $queryRaw: m.lock, rosterRole: { findUnique: m.role }, person: { findUnique: m.person }, rosterAssignment: { findUnique: m.existing, create: m.create, update: m.update }, rosterEvent: { create: m.event } };
  return { prisma: { $transaction: (fn: (_tx: typeof tx) => unknown) => fn(tx) } };
});
import { POST } from "@/app/api/roster/assignments/route";
const req = (active = true, day = "2026-11-07") => new Request("http://localhost/api/roster/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day, personId: "person", roleId: "role", active }) });
describe("asignaciones de jornada", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.actor.mockResolvedValue({ userId: "u", role: "COORDINATOR" });
    m.role.mockResolvedValue({ active: true, name: "Mozos" }); m.person.mockResolvedValue({ active: true, name: "Ana", user: { id: "user" } }); m.existing.mockResolvedValue(null); m.create.mockResolvedValue({ id: "assignment" }); m.update.mockResolvedValue({ id: "assignment" }); m.event.mockResolvedValue({}); m.lock.mockResolvedValue([]);
  });
  it("niega cambios a colaboradores y staff", async () => {
    m.actor.mockResolvedValueOnce({ userId: "u", role: "COLLAB" }); expect((await POST(req())).status).toBe(403); expect(m.create).not.toHaveBeenCalled();
  });
  it("asigna y registra historial conservando nombres al momento del cambio", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(m.event).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ASSIGNED", actorId: "u", personName: "Ana", roleName: "Mozos" }) });
  });
  it("evita duplicar y no crea eventos en un reintento", async () => {
    m.existing.mockResolvedValueOnce({ id: "assignment", active: true });
    expect(await (await POST(req())).json()).toEqual({ ok: true, changed: false });
    expect(m.create).not.toHaveBeenCalled(); expect(m.event).not.toHaveBeenCalled();
  });
  it("retira una asignación sin eliminarla y permite reactivarla", async () => {
    m.existing.mockResolvedValueOnce({ id: "assignment", active: true });
    expect((await POST(req(false))).status).toBe(200); expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false }) }));
    expect(m.event).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "REMOVED" }) });
    m.existing.mockResolvedValueOnce({ id: "assignment", active: false }); expect((await POST(req())).status).toBe(200);
  });
  it("no asigna personas inactivas ni funciones desactivadas", async () => {
    m.person.mockResolvedValueOnce({ active: false, name: "Ana", user: { id: "user" } }); expect((await POST(req())).status).toBe(400);
    m.role.mockResolvedValueOnce({ active: false, name: "Mozos" }); expect((await POST(req())).status).toBe(400); expect(m.create).not.toHaveBeenCalled();
  });
  it("rechaza fechas inválidas antes de escribir", async () => { expect((await POST(req(true, "2026-02-30"))).status).toBe(400); expect(m.lock).not.toHaveBeenCalled(); });
});
