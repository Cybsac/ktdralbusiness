export const dynamic = "force-dynamic";
import { apiError, apiOk } from "@/lib/apiError";
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { checkRateLimitCustom } from "@/lib/rateLimit";
import { redeemRecoveryCode } from "@/lib/users/passwords";
import { userFailure } from "@/lib/users/http";
export async function POST(req: Request) {
  try {
    if (await verifyUserSessionCookie(getUserSessionCookieFromRequest(req)))
      return apiError(
        "MUST_LOGOUT",
        "Cierra sesión antes de recuperar la contraseña",
        undefined,
        400
      );
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = checkRateLimitCustom(`reset:${ip}`, 5, 10000);
    if (!limit.ok) return apiError("RATE_LIMIT", "Intenta nuevamente", undefined, 429);
    const body = await req.json();
    return apiOk(
      await redeemRecoveryCode(
        String(body.dni || ""),
        String(body.code || "").trim(),
        body.password
      )
    );
  } catch (error) {
    return userFailure(error);
  }
}
