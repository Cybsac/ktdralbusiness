import jsQR from "jsqr";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
});
import { generateInviteCard } from "@/lib/birthdays/generateInviteCard";

describe("calidad de tarjetas", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("genera WebP y PNG con QR legible y dimensiones correctas", async () => {
    const template = await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: "#4c275b" },
    })
      .png()
      .toBuffer();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response(new Uint8Array(template), { status: 200 }))
        )
    );
    const url = "https://example.test/b/example";
    for (const format of ["webp", "png"] as const) {
      const image = await generateInviteCard("guest", "example", url, format);
      const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: 1080, height: 1920, channels: 4 });
      expect((await sharp(image).metadata()).format).toBe(format);
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(url);
    }
  });
});
