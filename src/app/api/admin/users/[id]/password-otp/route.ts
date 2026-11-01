export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { issueRecoveryCode } from "@/lib/users/passwords";
import { userFailure } from "@/lib/users/http";
import { checkRateLimitCustom } from "@/lib/rateLimit";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireUserActor(req, "write");
    const limit = checkRateLimitCustom(`user-recovery:${actor.userId}:${params.id}`, 5, 5 * 60000);
    if (!limit.ok) return NextResponse.json({ ok: false, code: "RATE_LIMIT" }, { status: 429 });
    return NextResponse.json(await issueRecoveryCode(params.id, actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return userFailure(error);
  }
}
