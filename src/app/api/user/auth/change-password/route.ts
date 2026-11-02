import { passwordSchema } from "@/lib/users/input";
import { createUserSessionCookie, buildSetUserCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { apiError, apiOk } from "@/lib/apiError";
import { USER_POLICY } from "@/lib/users/policy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const raw = getUserSessionCookieFromRequest(req);
    const session = await verifyUserSessionCookie(raw);
    if (!session) {
      return apiError("UNAUTHORIZED", "Sesión inválida", undefined, 401);
    }

    const body = await req.json().catch(() => ({}) as any);
    const { currentPassword, newPassword } = body || {};

    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || !newPassword) {
      return apiError("INVALID_INPUT", "Contraseña actual y nueva son requeridas", undefined, 400);
    }

    if (!passwordSchema.safeParse(newPassword).success) {
      return apiError(
        "INVALID_PASSWORD",
        `La contraseña debe tener al menos ${USER_POLICY.passwordMin} caracteres y como máximo ${USER_POLICY.passwordMax} bytes`,
        undefined,
        400
      );
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, passwordHash: true, forcePasswordChange: true },
    });

    if (!user) {
      return apiError("USER_NOT_FOUND", "Usuario no encontrado", undefined, 404);
    }

    // Verify current password
    let passwordValid = false;
    try {
      passwordValid = await bcrypt.compare(currentPassword, user.passwordHash || "");
    } catch (_err) {
      passwordValid = false;
    }

    if (!passwordValid) {
      return apiError("INVALID_CURRENT_PASSWORD", "Contraseña actual incorrecta", undefined, 401);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, USER_POLICY.bcryptRounds);

    // Update password and clear forcePasswordChange flag
    const updated = await prisma.user.updateMany({
      where: { id: session.userId, passwordHash: user.passwordHash },
      data: {
        passwordHash: newPasswordHash,
        forcePasswordChange: false,
      },
    });
    if (updated.count !== 1) return apiError("PASSWORD_CHANGED", "La contraseña cambió. Inicia sesión nuevamente.", undefined, 409);

    await logEvent("USER_PASSWORD_CHANGE", "Usuario cambió su contraseña", {
      userId: session.userId,
      username: user.username,
    });

    return apiOk({ ok: true, message: "Contraseña cambiada exitosamente" }, 200, {
      "Set-Cookie": buildSetUserCookie(
        await createUserSessionCookie(session.userId, session.role, session.area)
      ),
    });
  } catch (e: any) {
    await logEvent("USER_PASSWORD_CHANGE_ERROR", "Error cambiando contraseña", {
      message: String(e?.message || e),
    });
    return apiError("INTERNAL_ERROR", "Error interno", undefined, 500);
  }
}
