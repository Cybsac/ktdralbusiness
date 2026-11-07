import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyPublicChallenge } from "@/lib/security/turnstile";
describe("verificación pública", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("rechaza si falta configuración", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyPublicChallenge("token")).toBe(false);
  });
  it("acepta solo una respuesta válida para la acción y dominio configurados", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: "dni_lookup", hostname: "example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyPublicChallenge("token")).toBe(true);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, action: "other", hostname: "example.com" }),
    });
    expect(await verifyPublicChallenge("token")).toBe(false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, action: "dni_lookup", hostname: "other.com" }),
    });
    expect(await verifyPublicChallenge("token")).toBe(false);
  });
});
