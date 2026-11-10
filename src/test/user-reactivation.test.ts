import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPerson: vi.fn(),
  updatePerson: vi.fn(),
  createPerson: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
  updateStaff: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("new-password-hash") } }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: mocks.lock,
        person: {
          findUnique: mocks.findPerson,
          update: mocks.updatePerson,
          create: mocks.createPerson,
        },
        user: { update: mocks.updateUser, create: mocks.createUser },
        staff: { updateMany: mocks.updateStaff },
      }),
  },
}));
import { createUser } from "@/lib/users/service";

const input = {
  username: "12345678",
  password: "test-password",
  role: "STAFF" as const,
  person: {
    name: "Persona Ejemplo",
    dni: "12345678",
    documentType: "DNI" as const,
    area: "Seguridad" as const,
    whatsapp: "987654321",
    birthday: "2000-01-01",
    documentSexCode: "1" as const,
  },
};
const actor = { userId: "admin", role: "ADMIN" };

describe("reingreso de colaboradores archivados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPerson.mockResolvedValue({
      id: "person-id",
      active: false,
      documentType: "DNI",
      user: { id: "user-id", role: "STAFF" },
    });
    mocks.updatePerson.mockResolvedValue({ id: "person-id" });
    mocks.updateStaff.mockResolvedValue({ count: 1 });
    mocks.updateUser.mockResolvedValue({
      id: "user-id",
      username: input.username,
      role: input.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      person: {
        id: "person-id",
        code: input.person.dni,
        ...input.person,
        birthday: new Date("2000-01-01"),
        active: true,
      },
    });
  });
  it("recupera la misma persona y cuenta con una contraseña nueva, sin eliminar su historial", async () => {
    const user = await createUser(input, actor);
    expect(user.id).toBe("user-id");
    expect(mocks.updatePerson).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "person-id" },
        data: expect.objectContaining({ active: true }),
      })
    );
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-id" },
        data: expect.objectContaining({
          passwordHash: "new-password-hash",
          forcePasswordChange: true,
        }),
      })
    );
    expect(mocks.createPerson).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith("ADMIN_USER_REACTIVATE", "admin", { id: "user-id" });
  });
  it("no permite a coordinación recuperar cuentas de administración", async () => {
    mocks.findPerson.mockResolvedValueOnce({
      id: "person-id",
      active: false,
      documentType: "DNI",
      user: { id: "user-id", role: "ADMIN" },
    });
    await expect(
      createUser(input, { userId: "coordinator", role: "COORDINATOR" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updatePerson).not.toHaveBeenCalled();
  });
  it("no confunde el DNI con un carnet de extranjería del mismo número", async () => {
    mocks.findPerson.mockResolvedValueOnce({
      id: "person-id",
      active: false,
      documentType: "CE",
      user: null,
    });
    await expect(createUser(input, actor)).rejects.toMatchObject({
      code: "DOCUMENT_TYPE_MISMATCH",
    });
    expect(mocks.updatePerson).not.toHaveBeenCalled();
  });
  it("mantiene el registro normal para personas nuevas", async () => {
    mocks.findPerson.mockResolvedValueOnce(null);
    mocks.createPerson.mockResolvedValueOnce({ id: "new-person" });
    mocks.createUser.mockResolvedValueOnce({
      id: "new-user",
      username: input.username,
      role: input.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      person: {
        id: "new-person",
        code: input.person.dni,
        ...input.person,
        birthday: new Date("2000-01-01"),
        active: true,
      },
    });
    expect((await createUser(input, actor)).id).toBe("new-user");
    expect(mocks.createPerson).toHaveBeenCalledOnce();
    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
