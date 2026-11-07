import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  count: vi.fn(),
  person: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: m.actor }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    person: { findUnique: m.person },
    scan: { count: m.count },
    attendanceContext: { upsert: m.upsert },
  },
}));
import { POST } from "@/app/api/admin/attendance/context/route";
const req = () =>
  new Request("http://localhost/api/admin/attendance/context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-11-07", personId: "p", reason: "Pasantía" }),
  });
describe("motivos de asistencia", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.actor.mockResolvedValue({ userId: "u", role: "COORDINATOR" });
    m.count.mockResolvedValue(1);
    m.person.mockResolvedValue({ user: { id: "registered" } });
    m.upsert.mockResolvedValue({ reason: "Pasantía" });
  });
  it("registra el motivo sin crear marcas ni modificar el rol", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(m.upsert).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it("requiere que exista una marca y autorización", async () => {
    m.count.mockResolvedValueOnce(0);
    expect((await POST(req())).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
    m.actor.mockResolvedValueOnce({ role: "STAFF" });
    expect((await POST(req())).status).toBe(403);
  });
  it("exige una ficha de colaborador registrada", async () => {
    m.person.mockResolvedValueOnce({ user: null });
    expect((await POST(req())).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
