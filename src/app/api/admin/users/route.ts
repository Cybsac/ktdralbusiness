export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { listUsers } from "@/lib/users/query";
import { createUserSchema } from "@/lib/users/input";
import { createUser } from "@/lib/users/service";
import { userFailure } from "@/lib/users/http";
export async function GET(req: Request) {
  try {
    return NextResponse.json(await listUsers(req, await requireUserActor(req)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return userFailure(error);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await requireUserActor(req, "write");
    const user = await createUser(createUserSchema.parse(await req.json()), actor);
    return NextResponse.json({ ok: true, user, data: user }, { status: 201 });
  } catch (error) {
    return userFailure(error);
  }
}
