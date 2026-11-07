import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/birthdays/managementAuth", () => ({ birthdayPackAdministrator: mocks.admin }));
vi.mock("@/lib/supabase-server", () => ({
  BIRTHDAY_TEMPLATES_BUCKET: "birthday-templates",
  supabaseAdmin: { storage: { from: () => ({ upload: mocks.upload }) } },
}));
import { POST } from "@/app/api/admin/birthdays/template/route";

async function request(width: number, height: number) {
  const image = await sharp({ create: { width, height, channels: 3, background: "black" } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("template", new File([new Uint8Array(image)], "image.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/admin/birthdays/template", {
    method: "POST",
    body: form,
  });
}
describe("plantilla de invitación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ role: "ADMIN" });
    mocks.upload.mockResolvedValue({ error: null });
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  });
  it("rechaza acceso sin subir imágenes", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await POST(await request(1080, 1920))).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rechaza proporciones incorrectas", async () => {
    expect((await POST(await request(1080, 1080))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("normaliza y sobrescribe siempre el mismo archivo", async () => {
    expect((await POST(await request(1080, 1920))).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls[0][0]).toBe("newversioncard.webp");
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({
      upsert: true,
      contentType: "image/webp",
    });
    expect(await sharp(mocks.upload.mock.calls[0][1]).metadata()).toMatchObject({
      width: 1080,
      height: 1920,
      format: "webp",
    });
  });
});
