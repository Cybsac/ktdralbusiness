export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { resetActivePasswords } from "@/lib/users/passwords";
import { userFailure } from "@/lib/users/http";
import { checkRateLimitCustom } from "@/lib/rateLimit";
export async function POST(req: Request) {
  try {
    const actor = await requireUserActor(req, "admin");
    const limit = checkRateLimitCustom(`users-reset:${actor.userId}`, 1, 60000);
    if (!limit.ok) return NextResponse.json({ ok: false, code: "RATE_LIMIT" }, { status: 429 });
    const body = await req.json();
    return NextResponse.json(await resetActivePasswords(actor, body.confirm === true), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return userFailure(error);
  }
}
