import { NextResponse } from "next/server";

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { acceptNews } from "@/lib/internal-news/assignments";
import { newsFailure } from "@/lib/internal-news/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    return NextResponse.json({ ok: true, ...(await acceptNews(session.userId, await req.json())) });
  } catch (error) {
    return newsFailure(error);
  }
}
