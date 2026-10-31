import { notifyPrizeAuthorizationChanged } from "./realtime";
import { createHash, randomBytes } from "crypto";

import { apiError } from "@/lib/apiError";
import {
  getUserSessionCookieFromRequest,
  type UserSessionData,
  verifyUserSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { policyWindow, verifyPrizeCode } from "./code";
import { enableMissingPrizeCredentials } from "./credentials";
import { currentPersonalCodes } from "./personal-codes";
import { defaultPrizePolicy, policySchema, type PrizePolicy, type PrizeScope } from "./policy";

export async function readPrizePolicy() {
  const row = await prisma.prizeAuthorizationConfig.findUnique({ where: { id: "default" } });
  return { row, policy: row ? policySchema.parse(row.policy) : defaultPrizePolicy() };
}
export async function getPrizeOperator(
  req: Request
): Promise<(UserSessionData & { name: string }) | null> {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, username: true, person: { select: { active: true, name: true } } },
  });
  if (!user || !user.person.active) return null;
  return {
    ...session,
    role: user.role as UserSessionData["role"],
    name: user.person.name || user.username,
  };
}
export async function getPrizeAdministrator(req: Request) {
  const session = await getPrizeOperator(req);
  return session && ["ADMIN", "COORDINATOR"].includes(session.role) ? session : null;
}

export type PrizeActor = {
  userId: string;
  role: string;
  method: "session" | "otp";
  name?: string;
  credentialId?: string;
  revision?: number;
};
const actors = new WeakMap<Request, PrizeActor>();
export function getPrizeActor(req: Request): PrizeActor {
  const actor = actors.get(req);
  if (!actor) throw new Error("PRIZE_AUTH_CONTEXT_MISSING");
  return actor;
}
export function prizeDeliveryAudit(req: Request, scope: PrizeScope, resourceId: string) {
  return {
    type: "PRIZE_DELIVERED",
    message: "Entrega de premio registrada",
    metadata: JSON.stringify({ responsible: getPrizeActor(req), scope, resourceId }),
  };
}
async function recordActor(req: Request, scope: PrizeScope, actor: PrizeActor) {
  await prisma.eventLog.create({
    data: {
      type: "PRIZE_AUTHORIZED",
      message: "Responsable de canje identificado",
      metadata: JSON.stringify({ ...actor, scope, resource: new URL(req.url).pathname }),
    },
  });
  actors.set(req, actor);
}
export async function savePrizePolicy(
  policy: PrizePolicy,
  actor: string,
  expectedRevision: number,
  rotate = false
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.prizeAuthorizationConfig.findUnique({ where: { id: "default" } });
    if ((current?.revision ?? 0) !== expectedRevision) throw new Error("CONFIG_CONFLICT");
    let saved;
    if (!current) {
      saved = await tx.prizeAuthorizationConfig.create({
        data: {
          id: "default",
          policy,
          secret: randomBytes(32).toString("hex"),
          revision: 1,
          updatedBy: actor,
        },
      });
    } else {
      const changed = await tx.prizeAuthorizationConfig.updateMany({
        where: { id: "default", revision: expectedRevision },
        data: {
          policy,
          secret: rotate ? randomBytes(32).toString("hex") : current.secret,
          revision: { increment: 1 },
          updatedBy: actor,
        },
      });
      if (!changed.count) throw new Error("CONFIG_CONFLICT");
      saved = await tx.prizeAuthorizationConfig.findUniqueOrThrow({ where: { id: "default" } });
    }
    const autoEnabledCount = await enableMissingPrizeCredentials(tx, actor);
    return { ...saved, autoEnabledCount };
  });
  notifyPrizeAuthorizationChanged();
  return result;
}

// Session accounts always identify themselves. Only public requests need a personal OTP.
export async function requirePrizeAuthorization(
  req: Request,
  scope: PrizeScope
): Promise<Response | null> {
  actors.delete(req);
  try {
    const session = await getPrizeOperator(req);
    if (session) {
      await recordActor(req, scope, {
        userId: session.userId,
        role: session.role,
        name: session.name,
        method: "session",
      });
      return null;
    }
    const { row, policy } = await readPrizePolicy();
    if (!row)
      return apiError(
        "PRIZE_AUTH_SETUP_REQUIRED",
        "Administración debe configurar las claves personales para el canje público.",
        undefined,
        503
      );
    const window = policyWindow(policy, scope);
    if (!window.required)
      return apiError(
        "PRIZE_REDEMPTION_CLOSED",
        "El canje público está cerrado según la vigencia configurada.",
        undefined,
        423
      );
    const code = req.headers.get("x-prize-otp") || "";
    if (!code)
      return apiError(
        "PRIZE_OTP_REQUIRED",
        "Solicita al colaborador su clave personal para confirmar la entrega.",
        { validUntil: window.validUntil },
        428
      );
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown")
      .split(",")[0]
      .trim();
    const key = createHash("sha256").update(`public:${ip}`).digest("hex");
    const now = new Date();
    const resetAt = new Date(now.getTime() + policy.lockMinutes * 60000);
    const attempts = await prisma.$queryRaw<{ attempts: number; resetAt: Date }[]>`
      INSERT INTO "PrizeAuthorizationAttempt" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "PrizeAuthorizationAttempt"."resetAt" <= ${now} THEN 1 ELSE "PrizeAuthorizationAttempt"."attempts" + 1 END,
        "resetAt" = CASE WHEN "PrizeAuthorizationAttempt"."resetAt" <= ${now} THEN ${resetAt} ELSE "PrizeAuthorizationAttempt"."resetAt" END
      RETURNING "attempts", "resetAt"`;
    if (attempts[0].attempts > policy.maxAttempts)
      return apiError(
        "PRIZE_OTP_LOCKED",
        "Demasiados intentos. Espera antes de volver a intentar.",
        undefined,
        429,
        {
          "Retry-After": String(
            Math.max(1, Math.ceil((attempts[0].resetAt.getTime() - now.getTime()) / 1000))
          ),
        }
      );
    if (!/^\d{6}$/.test(code))
      return apiError(
        "PRIZE_OTP_INVALID",
        "La clave es incorrecta, está revocada o ya cambió.",
        undefined,
        403
      );
    const current = await currentPersonalCodes(now);
    if (!current.window.required)
      return apiError("PRIZE_REDEMPTION_CLOSED", "El canje público está cerrado.", undefined, 423);
    const collaborator = current.collaborators.find((item) => verifyPrizeCode(code, item.code));
    if (!collaborator)
      return apiError(
        "PRIZE_OTP_INVALID",
        "La clave es incorrecta, está revocada o ya cambió.",
        undefined,
        403
      );
    await prisma.prizeAuthorizationAttempt.deleteMany({ where: { key } });
    await recordActor(req, scope, {
      userId: collaborator.userId,
      role: collaborator.role,
      name: collaborator.name || collaborator.username,
      method: "otp",
      credentialId: collaborator.credentialId,
      revision: collaborator.revision,
    });
    return null;
  } catch {
    return apiError(
      "PRIZE_AUTH_UNAVAILABLE",
      "No se pudo verificar al responsable del canje. Intenta nuevamente.",
      undefined,
      503
    );
  }
}
