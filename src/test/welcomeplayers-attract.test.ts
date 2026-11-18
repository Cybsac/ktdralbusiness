import sharp from "sharp";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), download: vi.fn(), upload: vi.fn(), getPublicUrl: vi.fn() }));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: mocks.actor }));
vi.mock("@/lib/supabase-server", () => ({ supabaseAdmin: { storage: { from: () => ({ list: mocks.list, download: mocks.download, upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }) } } }));
import { GET } from "@/app/api/welcomeplayers/attract/route";
import { PATCH, POST } from "@/app/api/admin/welcomeplayers/attract/route";

describe("pantalla de bienvenida de la ruleta", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
    mocks.actor.mockResolvedValue({ userId: "operator", role: "COORDINATOR" });
    mocks.list.mockResolvedValue({ data: [], error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.test/asset" } });
  });
  it("mantiene la ruleta disponible cuando todavía no hay pantalla configurada", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({ config: { enabled: false, url: null } });
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("rechaza cargas sin autorización", async () => {
    mocks.actor.mockResolvedValueOnce({ userId: "staff", role: "STAFF" });
    expect((await POST(new NextRequest("http://localhost/api/admin/welcomeplayers/attract", { method: "POST" }))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("optimiza la imagen y sobrescribe solo los objetos de bienvenida", async () => {
    const image = await sharp({ create: { width: 90, height: 160, channels: 3, background: "#aabbcc" } }).png().toBuffer();
    const form = new FormData();
    form.append("media", new File([image], "imagen.png", { type: "image/png" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/welcomeplayers/attract", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(mocks.upload.mock.calls.map((call) => call[0])).toEqual(["welcomeplayers/attract/background.webp", "welcomeplayers/attract/config.json"]);
    expect((await sharp(mocks.upload.mock.calls[0][1]).metadata()).format).toBe("webp");
  });
  it("rechaza video con cabecera inválida sin subir archivos", async () => {
    const form = new FormData();
    form.append("media", new File(["invalid"], "video.mp4", { type: "video/mp4" }));
    expect((await POST(new NextRequest("http://localhost/api/admin/welcomeplayers/attract", { method: "POST", body: form }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("acepta video MP4 y guarda una referencia de video", async () => {
    const form = new FormData();
    form.append("media", new File([new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70])], "video.mp4", { type: "video/mp4" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/welcomeplayers/attract", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ config: { enabled: true, mediaType: "video" } });
    expect(mocks.upload.mock.calls.map((call) => call[0])).toEqual(["welcomeplayers/attract/background.mp4", "welcomeplayers/attract/config.json"]);
  });
  it("permite elegir un efecto sin sustituir el archivo y admite configuraciones anteriores", async () => {
    mocks.list.mockResolvedValue({ data: [{ name: "config.json" }], error: null });
    mocks.download.mockResolvedValue({ data: new Blob([JSON.stringify({ enabled: true, mediaType: "image", key: "welcomeplayers/attract/background.webp", revision: "987f7c22-aef4-446e-a6a3-95df52d00b29" })]), error: null });
    expect(await (await GET()).json()).toMatchObject({ config: { imageEffect: "none" } });
    const request = new NextRequest("http://localhost/api/admin/welcomeplayers/attract", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageEffect: "bounce" }) });
    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ config: { enabled: true, imageEffect: "bounce" } });
    expect(mocks.upload.mock.calls.map((call) => call[0])).toEqual(["welcomeplayers/attract/config.json"]);
  });
  it.each([["zoom", "bounce"], ["glow", "lights"]])("interpreta el efecto anterior %s como %s", async (before, after) => {
    mocks.list.mockResolvedValue({ data: [{ name: "config.json" }], error: null });
    mocks.download.mockResolvedValue({ data: new Blob([JSON.stringify({ enabled: true, mediaType: "image", key: "welcomeplayers/attract/background.webp", revision: "987f7c22-aef4-446e-a6a3-95df52d00b29", imageEffect: before })]), error: null });
    expect(await (await GET()).json()).toMatchObject({ config: { imageEffect: after } });
  });
});
