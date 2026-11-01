import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { Prisma } from "@prisma/client";
import { UserManagementError } from "./http";
import { canManageTarget } from "./policy";
export type UserActor = { userId: string; role: string };
export async function requireUserActor(req: Request, mode: "read" | "write" | "admin" = "read") {
  const actor = await getPrizeOperator(req);
  const allowed =
    mode === "admin"
      ? ["ADMIN"]
      : mode === "write"
        ? ["ADMIN", "COORDINATOR"]
        : ["ADMIN", "COORDINATOR", "STAFF"];
  if (!actor || !allowed.includes(actor.role)) throw new UserManagementError("UNAUTHORIZED", 401);
  return actor;
}
export function assertTarget(actor: UserActor, target: { id: string; role: string }) {
  if (!canManageTarget(actor, target)) throw new UserManagementError("FORBIDDEN", 403);
}
export async function lockUserManagement(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('admin-user-management'))::text`;
}
export async function protectLastAdmin(tx: Prisma.TransactionClient) {
  if (!(await tx.user.count({ where: { role: "ADMIN", person: { active: true } } })))
    throw new UserManagementError("LAST_ADMIN");
}
