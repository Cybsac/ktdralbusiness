import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: mocks.actor }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { storage: { from: () => ({ list: mocks.list, download: mocks.download, upload: mocks.upload }) } } }));
import { GET } from "@/app/api/welcomeplayers/message/route";
import { PATCH } from "@/app/api/admin/welcomeplayers/message/route";
const request = (message: string) => new Request("http://localhost/api/admin/welcomeplayers/message", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
describe("mensaje de la ruleta", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue({ data: [], error: null }); mocks.upload.mockResolvedValue({ error: null }); mocks.actor.mockResolvedValue({ role: "COORDINATOR" }); });
  it("usa el texto existente cuando no hay configuración", async () => { expect(await (await GET()).json()).toMatchObject({ message: "Un giro por grupo de cinco" }); });
  it("publica el mensaje guardado", async () => { mocks.list.mockResolvedValue({ data: [{ name: "message.json" }], error: null }); mocks.download.mockResolvedValue({ data: new Blob([JSON.stringify({ message: "Un giro por persona" })]), error: null }); expect(await (await GET()).json()).toMatchObject({ message: "Un giro por persona" }); });
  it("permite guardar a coordinación sin tocar otros archivos", async () => { const response = await PATCH(request(" Un giro por persona ")); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ message: "Un giro por persona" }); expect(mocks.upload.mock.calls[0][0]).toBe("welcomeplayers/settings/message.json"); });
  it("rechaza texto vacío y usuarios sin permiso", async () => { expect((await PATCH(request("  "))).status).toBe(400); mocks.actor.mockResolvedValue({ role: "STAFF" }); expect((await PATCH(request("Mensaje"))).status).toBe(403); expect(mocks.upload).not.toHaveBeenCalled(); });
});
