import { afterEach, describe, expect, it } from "vitest";

import { signBirthdayIdentity, verifyBirthdayIdentity } from "@/lib/birthdays/identity-proof";

describe("verificación de identidad de cumpleaños", () => {
  const previous = process.env.TOKEN_SECRET;
  const identity = { documento: "12345678", name: "Ana Prueba", birthDate: "2000-01-01" };
  afterEach(() => {
    if (previous === undefined) delete process.env.TOKEN_SECRET;
    else process.env.TOKEN_SECRET = previous;
  });
  it("vincula documento, nombre y nacimiento y caduca", () => {
    process.env.TOKEN_SECRET = "test-only-identity-signing-secret";
    const proof = signBirthdayIdentity(identity, 1_000_000)!;
    expect(verifyBirthdayIdentity(identity, proof, 1_000_000)).toBe(true);
    expect(verifyBirthdayIdentity({ ...identity, name: "Otro Nombre" }, proof, 1_000_000)).toBe(
      false
    );
    expect(verifyBirthdayIdentity({ ...identity, documento: "87654321" }, proof, 1_000_000)).toBe(
      false
    );
    expect(verifyBirthdayIdentity({ ...identity, birthDate: "2001-01-01" }, proof, 1_000_000)).toBe(
      false
    );
    expect(verifyBirthdayIdentity(identity, proof, 4_601_000)).toBe(false);
  });
  it("rechaza firmas sin clave y datos manipulados", () => {
    delete process.env.TOKEN_SECRET;
    expect(signBirthdayIdentity(identity)).toBeNull();
    expect(verifyBirthdayIdentity(identity, "1.invalid")).toBe(false);
  });
});
