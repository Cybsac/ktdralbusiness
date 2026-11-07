import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("react-admin", () => ({ fetchUtils: { fetchJson: api.fetchJson } }));
import { dataProvider, userPayload } from "@/lib/react-admin-data-provider";
import { isValidDocumentNumber, normalizeDocumentNumber } from "@/lib/users/document";
import { userFailure } from "@/lib/users/http";
import { createUserSchema } from "@/lib/users/input";

describe("edición de perfiles de usuario", () => {
  const existing = {
    id: "u",
    username: "operador",
    dni: null,
    area: "ADMIN",
    personName: "Usuario Ejemplo",
    role: "ADMIN",
    whatsapp: null,
    birthday: null,
  };
  beforeEach(() => vi.clearAllMocks());
  it("omite campos históricos sin cambios y envía solo la edición", () => {
    expect(
      userPayload({ ...existing, personName: "Nombre Actualizado", password: "" }, false, existing)
    ).toEqual({ personName: "Nombre Actualizado" });
  });
  it("permite limpiar teléfono y fecha y cambiar contraseña en la misma solicitud", () => {
    const before = { ...existing, whatsapp: "999999999", birthday: "2000-01-01" };
    expect(
      userPayload({ ...before, whatsapp: "", birthday: "", password: "clave-nueva" }, false, before)
    ).toEqual({ whatsapp: null, birthday: null, password: "clave-nueva" });
  });
  it("no envía valores nulos de DNI o área que el servidor no acepta", () => {
    expect(userPayload({ dni: null, area: null, personName: "Nombre" })).toEqual({
      personName: "Nombre",
    });
  });
  it("evita escribir cuando no hay cambios", async () => {
    const result = await dataProvider.update("users", {
      id: "u",
      data: { ...existing },
      previousData: existing,
    });
    expect(result.data).toEqual(existing);
    expect(api.fetchJson).not.toHaveBeenCalled();
  });
  it("envía únicamente los cambios a la ruta de usuarios", async () => {
    api.fetchJson.mockResolvedValue({
      json: { data: { ...existing, personName: "Nombre Actualizado" } },
    });
    await dataProvider.update("users", {
      id: "u",
      data: { ...existing, personName: "Nombre Actualizado" },
      previousData: existing,
    });
    expect(api.fetchJson).toHaveBeenCalledOnce();
    const [url, options] = api.fetchJson.mock.calls[0];
    expect(url).toBe("/api/admin/users/u");
    expect(JSON.parse(options.body)).toEqual({ personName: "Nombre Actualizado" });
  });
  it("valida DNI peruano y conserva letras en documentos extranjeros", () => {
    expect(isValidDocumentNumber("25546025", "CE")).toBe(true);
    expect(isValidDocumentNumber("1234567", "DNI")).toBe(false);
    expect(normalizeDocumentNumber("CE-AB 12345")).toBe("CEAB12345");
    const person = {
      name: "Prueba Usuario",
      dni: "1234567",
      documentType: "DNI",
      area: "Caja",
      whatsapp: null,
      birthday: null,
    };
    expect(
      createUserSchema.safeParse({ username: "prueba", password: "12345678", person }).success
    ).toBe(false);
    expect(
      createUserSchema.safeParse({
        username: "prueba",
        password: "12345678",
        person: { ...person, documentType: "CE" },
      }).success
    ).toBe(true);
  });
  it("devuelve mensaje entendible en conflictos únicos", async () => {
    const response = userFailure({ code: "P2002", meta: { target: ["username"] } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "USERNAME_TAKEN",
      message: "El nombre de usuario ya existe",
    });
  });
});
