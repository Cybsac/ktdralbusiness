import { describe, expect, it } from "vitest";
import { resolveBirthplace } from "@/lib/ubigeo/birthplace";

describe("resolución del ubigeo de nacimiento", () => {
  it("resuelve códigos coincidentes y conserva ceros iniciales", () => {
    expect(resolveBirthplace("010101")).toEqual({ department: "AMAZONAS", province: "CHACHAPOYAS", district: "CHACHAPOYAS" });
    expect(resolveBirthplace("10101")).toBeNull();
  });
  it("evita atribuir un lugar cuando los catálogos difieren o no coinciden", () => {
    expect(resolveBirthplace("050109")).toBeNull();
    expect(resolveBirthplace("180114")).toBeNull();
    expect(resolveBirthplace("999999")).toBeNull();
    expect(resolveBirthplace("050109", "inei")?.district).toBe("SAN JOSE DE TICLLAS");
    expect(resolveBirthplace("050109", "reniec")?.district).toBe("VINCHOS");
  });
});
