import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  lookup: vi.fn(),
  limit: vi.fn(),
  checkCreate: vi.fn(),
  visitFind: vi.fn(),
  visitCreate: vi.fn(),
  visitUpdate: vi.fn(),
  movementCreate: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@/lib/admission/access", () => ({ admissionActor: m.actor }));
vi.mock("@/lib/cluzter/dni", () => ({ lookupDni: m.lookup }));
vi.mock("@/lib/admission/limit", () => ({ allowAdmissionCheck: m.limit }));
vi.mock("@/lib/attendanceDay", () => ({ currentBusinessDay: () => "2026-11-07" }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: m.lock,
    admissionVisit: { findUnique: m.visitFind, create: m.visitCreate, update: m.visitUpdate },
    admissionMovement: { create: m.movementCreate },
  };
  return {
    prisma: {
      ...tx,
      admissionCheck: { create: m.checkCreate },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
import { POST as check } from "@/app/api/admission/check/route";
import { POST as move } from "@/app/api/admission/movement/route";
const req = (body: unknown) =>
  new Request("http://localhost/api/admission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("control de ingreso", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ADMISSION_SECRET", "test-secret-not-for-production");
    m.actor.mockResolvedValue({ userId: "operator", role: "STAFF" });
    m.limit.mockResolvedValue(true);
    m.checkCreate.mockResolvedValue({});
    m.visitFind.mockResolvedValue(null);
    m.lock.mockResolvedValue([]);
    m.visitCreate.mockResolvedValue({ id: "visit" });
    m.visitUpdate.mockResolvedValue({ id: "visit" });
    m.movementCreate.mockResolvedValue({});
  });
  it("no permite consulta sin acceso", async () => {
    m.actor.mockResolvedValueOnce(null);
    expect((await check(req({}))).status).toBe(403);
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("rechaza menores sin entregar comprobante", async () => {
    m.lookup.mockResolvedValue({
      names: "Ana",
      paternalSurname: "Ejemplo",
      birthDate: "2015-01-01",
      fatherName: "Juan",
      motherName: "Rosa",
    });
    const data = await (
      await check(req({ documentType: "DNI", documentNumber: "12345678" }))
    ).json();
    expect(data.result).toBe("MINOR");
    expect(data.birthDate).toBe("2015-01-01");
    expect(data.fatherName).toBe("Juan");
    expect(data.motherName).toBe("Rosa");
    expect(data.proof).toBeUndefined();
    expect(m.visitCreate).not.toHaveBeenCalled();
  });
  it("requiere fecha de nacimiento para extranjeros y no consulta su número como DNI", async () => {
    expect(
      (
        await check(
          req({
            documentType: "CE",
            documentNumber: "12345678",
            manualName: "Ana Ejemplo",
          })
        )
      ).status
    ).toBe(400);
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("registra revisión manual para documento extranjero sin llamar a Cluzter", async () => {
    const res = await check(
      req({
        documentType: "CE",
        documentNumber: "AB123456",
        manualName: "Ana Ejemplo",
        manualBirthDate: "1990-01-01",
      })
    );
    const data = await res.json();
    expect(data.result).toBe("ADULT");
    expect(data.birthDate).toBe("1990-01-01");
    expect(data.fatherName).toBeUndefined();
    expect(data.source).toBe("MANUAL");
    expect(data.proof).toBeTruthy();
    expect(m.lookup).not.toHaveBeenCalled();
  });
  it("no autoriza si el proveedor no devuelve fecha", async () => {
    m.lookup.mockResolvedValue({ names: "Ana", paternalSurname: "Ejemplo", birthDate: null });
    const data = await (
      await check(req({ documentType: "DNI", documentNumber: "12345678" }))
    ).json();
    expect(data.result).toBe("UNKNOWN");
    expect(data.proof).toBeUndefined();
  });
  it("solo registra al adulto verificado y evita duplicados", async () => {
    m.lookup.mockResolvedValue({
      names: "Ana",
      paternalSurname: "Ejemplo",
      birthDate: "1990-01-01",
    });
    const data = await (
      await check(req({ documentType: "DNI", documentNumber: "12345678" }))
    ).json();
    expect(data.result).toBe("ADULT");
    expect(data.proof).toBeTruthy();
    expect((await move(req({ proof: data.proof, action: "ENTRY" }))).status).toBe(200);
    expect(m.movementCreate).toHaveBeenCalledOnce();
    m.visitFind.mockResolvedValueOnce({ id: "visit", inside: true });
    expect((await move(req({ proof: data.proof, action: "ENTRY" }))).status).toBe(409);
    expect(m.visitCreate).toHaveBeenCalledOnce();
    expect((await move(req({ proof: `${data.proof}x`, action: "EXIT" }))).status).toBe(400);
    m.visitFind.mockResolvedValueOnce({ id: "visit", inside: true });
    expect((await move(req({ proof: data.proof, action: "EXIT" }))).status).toBe(200);
    m.visitFind.mockResolvedValueOnce({ id: "visit", inside: false });
    expect((await move(req({ proof: data.proof, action: "ENTRY" }))).status).toBe(200);
    expect(m.movementCreate).toHaveBeenCalledTimes(3);
  });
});
