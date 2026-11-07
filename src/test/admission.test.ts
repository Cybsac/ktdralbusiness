import { afterEach, describe, expect, it, vi } from "vitest";

import { admissionAge } from "@/lib/admission/age";
import { createAdmissionProof, documentHash, readAdmissionProof } from "@/lib/admission/proof";

describe("verificación de edad de admisión", () => {
  const now = new Date("2026-11-07T17:00:00Z");
  it("reconoce los 18 años el día del cumpleaños en Lima", () => {
    expect(admissionAge("2008-11-07", now)).toBe(18);
    expect(admissionAge("2008-11-08", now)).toBe(17);
  });
  it("rechaza fechas imposibles y futuras", () => {
    expect(admissionAge("2008-02-30", now)).toBeNull();
    expect(admissionAge("2027-01-01", now)).toBeNull();
    expect(admissionAge(null, now)).toBeNull();
  });
  it("agrupa el 29 de febrero el 1 de marzo cuando no hay día 29", () => {
    expect(admissionAge("2008-02-29", new Date("2026-02-28T17:00:00Z"))).toBe(17);
    expect(admissionAge("2008-02-29", new Date("2026-03-01T17:00:00Z"))).toBe(18);
  });
});
describe("comprobante de verificación", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("vincula la verificación al operador, jornada y tipo de documento", () => {
    vi.stubEnv("ADMISSION_SECRET", "test-secret-not-for-production");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T17:00:00Z"));
    const hash = documentHash("DNI", "12345678");
    expect(hash).not.toBe(documentHash("CE", "12345678"));
    const proof = createAdmissionProof({
      actor: "a",
      day: "2026-11-07",
      type: "DNI",
      hash,
      source: "CLUZTER",
    });
    expect(readAdmissionProof(proof, "a", "2026-11-07")?.hash).toBe(hash);
    expect(readAdmissionProof(proof, "b", "2026-11-07")).toBeNull();
    expect(readAdmissionProof(proof, "a", "2026-11-08")).toBeNull();
    expect(readAdmissionProof(`${proof}x`, "a", "2026-11-07")).toBeNull();
    vi.advanceTimersByTime(301000);
    expect(readAdmissionProof(proof, "a", "2026-11-07")).toBeNull();
  });
});
