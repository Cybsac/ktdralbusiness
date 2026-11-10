import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adultAtDate, ageAtDate } from "@/lib/cluzter/age";
import { cluzterGet } from "@/lib/cluzter/client";
import { getCluzterConfig } from "@/lib/cluzter/config";
import { lookupDni } from "@/lib/cluzter/dni";

const sample = {
  DNI: "12345678",
  NOMBRES: "Ana",
  AP_PAT: "Prueba",
  AP_MAT: "Ejemplo",
  FECHA_NAC: "19/11/2008",
  SEXO: "2",
  PADRE: "  José  ",
  MADRE: "María",
  UBIGEO_NAC: "010101",
  DIRECCION: "no debe propagarse",
};
describe("integración Cluzter", () => {
  beforeEach(() => {
    vi.stubEnv("CLUZTER_API_TOKEN", "fake-test-token");
    vi.stubEnv("CLUZTER_API_BASE_URL", "https://api.example.test");
    vi.stubEnv("CLUZTER_TIMEOUT_MS", "2000");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("consulta solo en servidor, valida y minimiza los datos", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(sample), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupDni("12345678")).toEqual({
      dni: "12345678",
      names: "Ana",
      paternalSurname: "Prueba",
      maternalSurname: "Ejemplo",
      birthDate: "2008-11-19",
      fatherName: "José",
      motherName: "María",
      birthUbigeo: "010101",
      documentSexCode: "2",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url.href).toBe("https://api.example.test/api/dni/12345678");
    expect(options.headers.Authorization).toBe("Bearer fake-test-token");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
  });
  it("rechaza DNI incorrecto sin consultar", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(lookupDni("123")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("no acepta una respuesta para otro DNI y no inventa fechas", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ...sample, DNI: "87654321" })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ...sample, FECHA_NAC: "31/02/2008" })))
    );
    await expect(lookupDni("12345678")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect((await lookupDni("12345678")).birthDate).toBeNull();
  });
  it.each([
    [401, "AUTH"],
    [402, "QUOTA"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
  ] as const)("traduce HTTP %i sin reintentos", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(lookupDni("12345678")).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rechaza redirecciones externas de operación y errores de conexión", async () => {
    await expect(cluzterGet("https://other.example/api/dni/12345678")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red")));
    await expect(lookupDni("12345678")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it("no funciona sin credencial o con configuración insegura", () => {
    vi.stubEnv("CLUZTER_API_TOKEN", "");
    expect(() => getCluzterConfig()).toThrow("NOT_CONFIGURED");
    vi.stubEnv("CLUZTER_API_TOKEN", "fake");
    vi.stubEnv("CLUZTER_API_BASE_URL", "http://example.test");
    expect(() => getCluzterConfig()).toThrow("NOT_CONFIGURED");
  });
  it("calcula la mayoría de edad en la fecha del evento y distingue datos desconocidos", () => {
    expect(adultAtDate("2008-11-19", "2026-11-18")).toBe(false);
    expect(adultAtDate("2008-11-19", "2026-11-19")).toBe(true);
    expect(adultAtDate(null, "2026-11-19")).toBeNull();
    expect(ageAtDate("2027-01-01", "2026-11-19")).toBeNull();
    expect(ageAtDate("2008-02-30", "2026-11-19")).toBeNull();
  });
});
