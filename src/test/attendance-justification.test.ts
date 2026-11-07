import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  lock: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  event: vi.fn(),
  scan: vi.fn(),
}));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: m.actor }));
vi.mock("@/lib/attendanceDay", () => ({ currentBusinessDay: () => "2026-11-07" }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: m.lock,
    attendanceJustification: { findUnique: m.get, upsert: m.save },
    attendanceJustificationEvent: { create: m.event },
    scan: { findFirst: m.scan },
  };
  return { prisma: { ...tx, $transaction: (fn: (_tx: typeof tx) => unknown) => fn(tx) } };
});
import { POST } from "@/app/api/admin/attendance/justification/route";
const req = (action = "justify", reason = "Cierre sin registrar") =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day: "2026-11-06", personId: "p", action, reason }),
  });
describe("justificación de salida", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.actor.mockResolvedValue({ userId: "manager", role: "COORDINATOR" });
    m.lock.mockResolvedValue([]);
    m.get.mockResolvedValue(null);
    m.scan.mockResolvedValue({ id: "entry", type: "IN" });
    m.save.mockResolvedValue({ id: "j" });
  });
  it("guarda comentario vinculado a la última entrada y registra el autor", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ entryScanId: "entry", reason: "Cierre sin registrar" }),
      })
    );
    expect(m.event).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "JUSTIFIED",
        actorId: "manager",
        entryScanId: "entry",
      }),
    });
  });
  it("permite revocar con comentario conservando el historial", async () => {
    m.get.mockResolvedValue({ active: true, reason: "Anterior", entryScanId: "entry" });
    expect((await POST(req("revoke", "Motivo de revocación"))).status).toBe(200);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ active: false }) })
    );
    expect(m.event).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "REVOKED", reason: "Motivo de revocación" }),
    });
  });
  it("rechaza si ya existe salida y no registra datos", async () => {
    m.scan.mockResolvedValueOnce({ id: "exit", type: "OUT" });
    expect((await POST(req())).status).toBe(409);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("rechaza comentarios cortos o usuarios sin permiso", async () => {
    expect((await POST(req("justify", "no"))).status).toBe(400);
    m.actor.mockResolvedValueOnce({ role: "STAFF" });
    expect((await POST(req())).status).toBe(403);
    expect(m.save).not.toHaveBeenCalled();
  });
});
