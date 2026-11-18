import { NextRequest } from "next/server";
import { apiError } from "@/lib/apiError";
import { getSessionCookieFromRequest, requireRole, verifySessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const cookie = getSessionCookieFromRequest(req as unknown as Request);
  const session = await verifySessionCookie(cookie);
  const auth = requireRole(session, ["ADMIN", "COORDINATOR"]);
  return auth.ok ? null : { code: auth.error || "UNAUTHORIZED", status: auth.error === "UNAUTHORIZED" ? 401 : 403 };
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return apiError(denied.code, denied.code, undefined, denied.status);

  return apiError("WELCOMEPLAYERS_RESET_DISABLED", "Los giros se organizan por jornada y su historial se conserva.", undefined, 410);
}
