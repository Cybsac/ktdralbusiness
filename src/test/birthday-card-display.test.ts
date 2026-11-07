import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
});

import { birthdayCardAvailable } from "@/lib/birthdays/card-policy";
import { generateInviteCard } from "@/lib/birthdays/generateInviteCard";

describe("tarjetas de cumpleaños", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("no presenta como disponible una reserva cuya fecha ya pasó", () => {
    expect(
      birthdayCardAvailable(
        { status: "approved", date: new Date("2026-10-21T05:00:00Z") },
        new Date("2026-11-06T12:00:00Z")
      )
    ).toBe(false);
  });
  it("no genera una tarjeta con fondo plano si falla la plantilla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(generateInviteCard("guest", "test", "https://example.com/b/test")).rejects.toThrow(
      "Birthday template request failed: 503"
    );
  });
});
