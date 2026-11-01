import { createUserSessionCookie, buildSetUserCookie, type UserRole } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { getUser, updateUser, archiveUser } from "@/lib/users/service";
import { userFailure } from "@/lib/users/http";
import { updateUserSchema } from "@/lib/users/input";
type Context = { params: { id: string } };
export async function GET(req: Request, { params }: Context) {
  try {
    return NextResponse.json(await getUser(params.id, await requireUserActor(req, "write")), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return userFailure(error);
  }
}
export async function PATCH(req: Request, { params }: Context) {
  try {
    const actor = await requireUserActor(req, "write");
    const user = await updateUser(params.id, updateUserSchema.parse(await req.json()), actor);
    const response = NextResponse.json({ ok: true, data: user });
    if (params.id === actor.userId)
      response.headers.set(
        "Set-Cookie",
        buildSetUserCookie(
          await createUserSessionCookie(user.id, user.role as UserRole, user.area || undefined)
        )
      );
    return response;
  } catch (error) {
    return userFailure(error);
  }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    return NextResponse.json(await archiveUser(params.id, await requireUserActor(req)));
  } catch (error) {
    return userFailure(error);
  }
}
