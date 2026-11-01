import { createUserSessionCookie, buildSetUserCookie } from "@/lib/auth";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUserActor } from "@/lib/users/access";
import { exportUsers, restoreUsers } from "@/lib/users/backup";
import { USER_POLICY as P } from "@/lib/users/policy";
import { userFailure, UserManagementError } from "@/lib/users/http";
export async function GET(req: Request) {
  try {
    const backup = await exportUsers(await requireUserActor(req, "admin"));
    return NextResponse.json(backup, {
      headers: {
        "Content-Disposition": `attachment; filename="usuarios_backup_${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return userFailure(error);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await requireUserActor(req, "admin");
    const form = await req.formData();
    const file = form.get("backup");
    if (!(file instanceof File) || file.size > P.maxBackupBytes)
      throw new UserManagementError("INVALID_BACKUP", 400);
    const result = await restoreUsers(JSON.parse(await file.text()), actor);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "Set-Cookie": buildSetUserCookie(
          await createUserSessionCookie(actor.userId, actor.role, actor.area)
        ),
      },
    });
  } catch (error) {
    return userFailure(error);
  }
}
