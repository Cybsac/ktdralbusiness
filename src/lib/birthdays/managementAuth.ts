import { NextRequest } from "next/server";

import {
  getSessionCookieFromRequest,
  getUserSessionCookieFromRequest,
  verifySessionCookie,
  verifyUserSessionCookie,
} from "@/lib/auth";

export async function birthdayManager(req: NextRequest) {
  const admin = await verifySessionCookie(getSessionCookieFromRequest(req));
  if (admin && ["ADMIN", "COORDINATOR", "STAFF"].includes(admin.role)) return admin;
  const user = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (user && ["ADMIN", "COORDINATOR", "STAFF", "COLLAB"].includes(user.role)) return user;
  return null;
}
