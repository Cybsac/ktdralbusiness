export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { updateUser } from "@/lib/users/service";
import { passwordSchema } from "@/lib/users/input";
import { userFailure } from "@/lib/users/http";
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireUserActor(req, "write");
    const body = await req.json();
    await updateUser(params.id, { password: passwordSchema.parse(body.password) }, actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return userFailure(error);
  }
}
