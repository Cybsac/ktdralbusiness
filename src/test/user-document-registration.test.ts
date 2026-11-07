import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const personCreate = vi.fn(),
    userCreate = vi.fn();
  return {
    personCreate,
    userCreate,
    prisma: {
      user: { findFirst: vi.fn() },
      person: { findFirst: vi.fn() },
      $transaction: vi.fn((fn) =>
        fn({ person: { create: personCreate }, user: { create: userCreate } })
      ),
    },
    verify: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({
  createUserSessionCookie: vi.fn().mockResolvedValue("cookie"),
  buildSetUserCookie: vi.fn().mockReturnValue("user_session=fake"),
  getUserSessionCookieFromRequest: vi.fn().mockReturnValue("cookie"),
  verifyUserSessionCookie: mocks.verify,
}));
vi.mock("bcryptjs", () => ({ default: { genSaltSync: () => "salt", hashSync: () => "hash" } }));
import { POST as staffRegistration } from "@/app/api/pedidos/users/route";
import { POST as publicRegistration } from "@/app/api/user/auth/register/route";

const makeRequest = (documentType: string, dni: string) =>
  new Request("http://localhost/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ana Prueba",
      dni,
      documentType,
      area: "Caja",
      password: "password123",
      whatsapp: "999999999",
      birthday: "2000-01-01",
      documentSexCode: "2",
    }),
  });
describe("registro de tipos de documento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ role: "COORDINATOR" });
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.person.findFirst.mockResolvedValue(null);
    mocks.personCreate.mockImplementation(async ({ data }) => ({ ...data, id: "person" }));
    mocks.userCreate.mockImplementation(async ({ data }) => ({ ...data, id: "user" }));
  });
  it.each([
    ["publico", publicRegistration],
    ["personal", staffRegistration],
  ] as const)("acepta carnet alfanumérico en %s sin convertirlo a DNI", async (_name, handler) => {
    const response = await handler(makeRequest("CE", "AB-12345"));
    expect(response.status).toBe(201);
    expect(mocks.personCreate.mock.calls[0][0].data).toMatchObject({
      dni: "AB12345",
      documentType: "CE",
      documentSexCode: null,
    });
  });
  it.each([
    ["publico", publicRegistration],
    ["personal", staffRegistration],
  ] as const)("rechaza DNI inválido en %s antes de crear", async (_name, handler) => {
    const response = await handler(makeRequest("DNI", "1234567"));
    expect(response.status).toBe(400);
    expect(mocks.personCreate).not.toHaveBeenCalled();
  });
});
