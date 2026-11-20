import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ find: vi.fn(), save: vi.fn(), prizes: vi.fn(), build: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/welcomeplayers/store", () => ({ getWelcomePlayersSpin: mocks.find, recordWelcomePlayersSpin: mocks.save }));
vi.mock("@/lib/welcomeplayers/repository", () => ({ getActiveWelcomePlayersPrizes: mocks.prizes }));
vi.mock("@/lib/welcomeplayers/engine", () => ({ buildSpinResult: mocks.build }));
vi.mock("@/lib/log", () => ({ logEvent: mocks.log }));
import { POST } from "@/app/api/welcomeplayers/spin/route";
const id = "1234567890abcdef1234567890abcdef";
const result = { spinId: id, prize: { id: "1", label: "Premio" }, prizeIndex: 0, turns: 5, rotation: 1800, createdAt: "2026-11-19T00:00:00.000Z" };
const request = (requestId: string) => new NextRequest("http://localhost/api/welcomeplayers/spin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId }) });
describe("reintentos seguros de la ruleta", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue(null); mocks.prizes.mockResolvedValue([{}, {}, {}]); mocks.build.mockReturnValue({ ...result }); mocks.save.mockResolvedValue(undefined); mocks.log.mockResolvedValue(undefined); });
  it("registra el identificador del intento", async () => { expect((await POST(request(id))).status).toBe(200); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ spinId: id })); });
  it("recupera el giro anterior sin registrar otro aunque cambien los premios", async () => { mocks.find.mockResolvedValue(result); expect(await (await POST(request(id))).json()).toMatchObject(result); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.prizes).not.toHaveBeenCalled(); });
  it("resuelve dos solicitudes simultáneas con el mismo identificador", async () => { mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce(result); mocks.save.mockRejectedValue({ code: "P2002" }); expect(await (await POST(request(id))).json()).toMatchObject(result); });
  it("rechaza identificadores incorrectos", async () => { expect((await POST(request("bad"))).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled(); });
});
