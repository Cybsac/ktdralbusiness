import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  roles: vi.fn(),
  assignments: vi.fn(),
  events: vi.fn(),
  users: vi.fn(),
  role: vi.fn(),
  people: vi.fn(),
  scans: vi.fn(),
  evaluation: vi.fn(),
  justifications: vi.fn(),
}));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: m.actor }));
vi.mock("@/lib/attendanceDay", () => ({ currentBusinessDay: () => "2026-11-06" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rosterRole: { findMany: m.roles, findUnique: m.role },
    rosterAssignment: { findMany: m.assignments },
    rosterEvent: { findMany: m.events },
    user: { findMany: m.users },
    person: { findMany: m.people },
    scan: { findMany: m.scans },
    dailyEvaluation: { findUnique: m.evaluation },
    attendanceJustification: { findMany: m.justifications },
  },
}));
import { GET as people } from "@/app/api/roster/people/route";
import { GET as roster } from "@/app/api/roster/route";
describe("consulta de rol diario", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.actor.mockResolvedValue({ userId: "u", role: "COLLAB" });
    m.roles.mockResolvedValue([]);
    m.assignments.mockResolvedValue([]);
    m.events.mockResolvedValue([]);
    m.users.mockResolvedValue([]);
    m.evaluation.mockResolvedValue(null);
    m.justifications.mockResolvedValue([]);
  });
  it("muestra la jornada actual al colaborador sin acceso al historial ni a la búsqueda de todo el personal", async () => {
    const data = await (await roster(new Request("http://localhost/api/roster"))).json();
    expect(data.day).toBe("2026-11-06");
    expect(data.canEdit).toBe(false);
    expect(data.history).toEqual([]);
    expect(m.events).not.toHaveBeenCalled();
    expect((await people(new Request("http://localhost/api/roster/people?roleId=x"))).status).toBe(
      403
    );
  });
  it("omite el historial cuando la vista de coordinación no lo necesita", async () => {
    m.actor.mockResolvedValue({ userId: "u", role: "COORDINATOR" });
    const data = await (await roster(new Request("http://localhost/api/roster?history=0"))).json();
    expect(data.canEdit).toBe(true);
    expect(data.history).toEqual([]);
    expect(m.events).not.toHaveBeenCalled();
  });
  it("muestra el estado de marcas a coordinación sin exponerlo a otros colaboradores", async () => {
    m.assignments.mockResolvedValue([
      { id: "a", personId: "p", roleId: "r", person: { name: "Ana", area: "Barra" } },
    ]);
    m.scans.mockResolvedValue([
      { personId: "p", type: "IN", scannedAt: new Date("2026-11-06T23:00:00Z") },
    ]);
    m.actor.mockResolvedValue({ userId: "u", role: "COORDINATOR" });
    const manager = await (await roster(new Request("http://localhost/api/roster"))).json();
    expect(manager.assignments[0].attendance.state).toBe("IN_PROGRESS");
    m.scans.mockClear();
    m.actor.mockResolvedValue({ userId: "u", role: "COLLAB" });
    const collaborator = await (await roster(new Request("http://localhost/api/roster"))).json();
    expect(collaborator.assignments[0].attendance).toBeUndefined();
    expect(m.scans).not.toHaveBeenCalled();
  });
  it("prioriza el área correspondiente y limita la respuesta de búsqueda", async () => {
    m.actor.mockResolvedValue({ userId: "u", role: "COORDINATOR" });
    m.role.mockResolvedValue({ name: "Mozos", active: true });
    m.people
      .mockResolvedValueOnce([{ id: "a", name: "Ana", area: "Mozos" }])
      .mockResolvedValueOnce([{ id: "b", name: "Beto", area: "Caja" }]);
    const response = await people(new Request("http://localhost/api/roster/people?roleId=x&q=a"));
    const data = await response.json();
    expect(data.people.map((p: { id: string }) => p.id)).toEqual(["a", "b"]);
    expect(m.people).toHaveBeenCalledTimes(2);
  });
  it("rechaza jornadas que no existen", async () => {
    expect((await roster(new Request("http://localhost/api/roster?day=2026-02-30"))).status).toBe(
      400
    );
    expect(m.assignments).not.toHaveBeenCalled();
  });
});
