import { Prisma } from "@prisma/client";

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { NEWS_POLICY } from "./contracts";
export class NewsError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export async function newsOperator(req: Request, kind: "content" | "assignment" = "content") {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (!session) throw new NewsError("UNAUTHORIZED", "Inicia sesión", 401);
  const roles: readonly string[] =
    kind === "content" ? NEWS_POLICY.contentRoles : NEWS_POLICY.assignmentRoles;
  if (!roles.includes(session.role))
    throw new NewsError("FORBIDDEN", "No tienes permiso para esta operación", 403);
  return session;
}
export async function serialNews<T>(fn: (_tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      const conflict = error as { code?: string; meta?: { target?: string | string[] } };
      const target = conflict.meta?.target;
      const revisionConflict =
        conflict.code === "P2002" &&
        (Array.isArray(target)
          ? target.includes("questionSetId") && target.includes("version")
          : target?.includes("questionSetId_version"));
      if ((conflict.code !== "P2034" && !revisionConflict) || attempt + 1 >= NEWS_POLICY.retries)
        throw error;
    }
}
export async function assertEditable(tx: Prisma.TransactionClient, id: string) {
  const [assigned, played] = await Promise.all([
    tx.commitmentAssignment.count({ where: { questionSetId: id, revisionId: null } }),
    tx.triviaSession.count({ where: { questionSetId: id } }),
  ]);
  if (assigned || played)
    throw new NewsError(
      "CONTENT_IN_USE",
      "Este contenido tiene historial sin revisión o sesiones públicas. Crea un comunicado nuevo para modificarlo.",
      409
    );
}
