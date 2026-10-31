import { apiError } from "@/lib/apiError";
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";

export const PRIZE_MANAGEMENT_POLICY = {
  roles: ["ADMIN", "COORDINATOR"],
  areas: ["Animación", "Multimedia"],
} as const;
export async function requirePrizeManagement(req: Request) {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (!session) return apiError("UNAUTHORIZED", "Inicia sesión", undefined, 401);
  if (
    !(PRIZE_MANAGEMENT_POLICY.roles as readonly string[]).includes(session.role) &&
    !(PRIZE_MANAGEMENT_POLICY.areas as readonly string[]).includes(session.area || "")
  )
    return apiError(
      "FORBIDDEN",
      "No tienes permiso para gestionar premios o lotes",
      undefined,
      403
    );
  return null;
}
