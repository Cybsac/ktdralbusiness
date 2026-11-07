import { getSessionCookieFromRequest, requireRole, verifySessionCookie } from "@/lib/auth";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
export async function canViewAttendance(req: Request) {
  const user = await getPrizeOperator(req);
  if (user && ["ADMIN", "COORDINATOR", "STAFF"].includes(user.role)) return true;
  const legacy = await verifySessionCookie(getSessionCookieFromRequest(req));
  return !!legacy && requireRole(legacy, ["ADMIN", "STAFF"]).ok;
}
