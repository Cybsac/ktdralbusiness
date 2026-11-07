import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ allowed: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/attendance/access", () => ({ canViewAttendance: m.allowed }));
vi.mock("@/lib/attendanceDay", () => ({ currentBusinessDay: () => "2026-11-07" }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: m.query } }));
import { GET } from "@/app/api/admin/attendance/metrics/route";
const row = (
  id: string,
  day: string,
  roles: string[] | null,
  firstIn: Date | null,
  lastOut: Date | null,
  lastType: string | null
) => ({
  personId: id,
  userId: id,
  personCode: id,
  personName: id,
  area: "Barra",
  day,
  roles,
  firstIn,
  lastIn: firstIn,
  lastOut,
  lastType,
  contextReason: null,
  doneCount: 0,
  totalCount: 0,
});
describe("métricas basadas en programación", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.allowed.mockResolvedValue(true);
  });
  it("cuenta solo jornadas programadas cerradas sin entrada y separa ingresos no programados", async () => {
    const entry = new Date("2026-11-06T20:00:00Z"),
      exit = new Date("2026-11-06T23:00:00Z");
    m.query.mockResolvedValue([
      row("programado", "2026-11-06", ["Mozos"], null, null, null),
      row("extra", "2026-11-06", null, entry, exit, "OUT"),
      row("pendiente", "2026-11-07", ["Caja"], null, null, null),
    ]);
    const data = await (
      await GET(
        new Request("http://localhost?period=custom&startDate=2026-11-06&endDate=2026-11-07")
      )
    ).json();
    expect(data.summary.scheduledShifts).toBe(2);
    expect(data.summary.missingEntry).toBe(1);
    expect(data.summary.pending).toBe(1);
    expect(data.summary.unscheduled).toBe(1);
    expect(data.topAbsences.map((v: { personName: string }) => v.personName)).toEqual([
      "programado",
    ]);
  });
  it("rechaza acceso no autorizado", async () => {
    m.allowed.mockResolvedValue(false);
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("conserva en incompletas las jornadas justificadas", async () => {
    const entry = new Date("2026-11-06T20:00:00Z");
    m.query.mockResolvedValue([
      {
        ...row("persona", "2026-11-06", ["Barra"], entry, null, "IN"),
        justificationReason: "Salida sin marca",
      },
    ]);
    const data = await (
      await GET(
        new Request("http://localhost?period=custom&startDate=2026-11-06&endDate=2026-11-06")
      )
    ).json();
    expect(data.summary.incompleteShifts).toBe(1);
  });
});
