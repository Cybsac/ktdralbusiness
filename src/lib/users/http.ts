import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class UserManagementError extends Error {
  constructor(
    public code: string,
    public status = 409
  ) {
    super(code);
  }
}
export function userFailure(error: unknown) {
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "JSON inválido" },
      { status: 400 }
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        message: error.issues[0]?.message,
        details: error.flatten(),
      },
      { status: 400 }
    );
  if (error instanceof UserManagementError)
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message:
          (
            {
              FORBIDDEN: "No tienes permiso para gestionar esa cuenta",
              SELF_DELETE: "No puedes eliminar tu propia cuenta",
              LAST_ADMIN: "Debe conservarse un administrador activo",
              NOT_FOUND: "Usuario no encontrado",
              INVALID_BACKUP: "Respaldo inválido",
              CONFIRM_REQUIRED: "Confirma la operación",
              INVALID_DNI_OR_CODE: "Documento o código inválido",
              USERNAME_TAKEN: "El nombre de usuario ya existe",
              DNI_TAKEN: "El documento ya está registrado",
            } as Record<string, string>
          )[error.code] || error.code,
      },
      { status: error.status }
    );
  const unique = error as { code?: string; meta?: { target?: string[] } };
  if (unique.code === "P2002") {
    const field = String(unique.meta?.target || "");
    return NextResponse.json(
      {
        ok: false,
        code: field.includes("username")
          ? "USERNAME_TAKEN"
          : field.includes("dni")
            ? "DNI_TAKEN"
            : "CODE_TAKEN",
      },
      { status: 409 }
    );
  }
  console.error("users.operation.failed", error);
  return NextResponse.json(
    { ok: false, code: "INTERNAL", message: "No se pudo completar la operación" },
    { status: 500 }
  );
}
