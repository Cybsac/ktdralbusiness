import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), prizes: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { welcomePlayersSpin: { count: mocks.count, groupBy: mocks.groupBy, findMany: mocks.findMany, create: mocks.create, deleteMany: mocks.deleteMany } } }));
vi.mock("@/lib/welcomeplayers/repository", () => ({ listWelcomePlayersPrizes: mocks.prizes }));
vi.mock("@/lib/auth", () => ({ getSessionCookieFromRequest: () => "session", verifySessionCookie: async () => ({ role: "ADMIN" }), requireRole: () => ({ ok: true }) }));
import { getWelcomePlayersState, recordWelcomePlayersSpin } from "@/lib/welcomeplayers/store";
import { GET } from "@/app/api/welcomeplayers/stats/route";
import { POST as reset } from "@/app/api/admin/welcomeplayers/spins/reset/route";

describe("jornadas de Ruleta Regalona", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ATTENDANCE_CUTOFF_HOUR", "14");
    mocks.count.mockResolvedValue(3);
    mocks.groupBy.mockResolvedValue([
      { prizeId: "a", prizeLabel: "Nombre anterior", prizeColor: "#fff", _count: { _all: 1 } },
      { prizeId: "a", prizeLabel: "Nombre nuevo", prizeColor: "#fff", _count: { _all: 1 } },
      { prizeId: "deleted", prizeLabel: "Premio retirado", prizeColor: "#000", _count: { _all: 1 } },
    ]);
    mocks.findMany.mockResolvedValue([{ id: "spin", prizeId: "deleted", prizeLabel: "Premio retirado", prizeColor: "#000", createdAt: new Date("2026-11-18T08:00:00Z") }]);
    mocks.prizes.mockResolvedValue([]);
  });
  it("consulta la ventana de jornada sin borrar históricos y conserva premios retirados o renombrados", async () => {
    const state = await getWelcomePlayersState([{ id: "a", label: "Nombre nuevo", color: "#fff", status: "active", weight: 1, order: 0 }], "2026-11-17");
    const where = { createdAt: { gte: new Date("2026-11-17T19:00:00Z"), lt: new Date("2026-11-18T19:00:00Z") } };
    expect(mocks.count).toHaveBeenCalledWith({ where });
    expect(mocks.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(state).toMatchObject({ businessDay: "2026-11-17", totalSpins: 3, prizeCounts: expect.arrayContaining([expect.objectContaining({ prizeId: "a", count: 2 }), expect.objectContaining({ prizeId: "deleted", count: 1 })]) });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("conserva el instante del giro, incluido alrededor del corte de jornada", async () => {
    await recordWelcomePlayersSpin({ spinId: "spin", prize: { id: "a", label: "Premio", color: "#fff", status: "active", weight: 1, order: 0 }, prizeIndex: 0, turns: 5, rotation: 1800, createdAt: "2026-11-18T18:59:59.000Z" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdAt: new Date("2026-11-18T18:59:59.000Z") }) }));
  });
  it("rechaza fechas imposibles antes de consultar", async () => {
    const response = await GET(new NextRequest("http://localhost/api/welcomeplayers/stats?day=2026-02-30"));
    expect(response.status).toBe(400);
    expect(mocks.count).not.toHaveBeenCalled();
  });
  it("no permite reiniciar borrando todos los giros", async () => {
    expect((await reset(new NextRequest("http://localhost/api/admin/welcomeplayers/spins/reset", { method: "POST" }))).status).toBe(410);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
