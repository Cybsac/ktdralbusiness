import { describe, expect, it } from "vitest";
import { documentSex } from "@/lib/cluzter/sex";

describe("sexo del documento", () => {
  it("traduce el código y deja sin valor lo desconocido", () => {
    expect(documentSex("1")).toBe("MALE");
    expect(documentSex("2")).toBe("FEMALE");
    expect(documentSex(null)).toBeNull();
    expect(documentSex("1", "no válido")).toBeNull();
    expect(documentSex("2", "2")).toBe("MALE");
  });
});
