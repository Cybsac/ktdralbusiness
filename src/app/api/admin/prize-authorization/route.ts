import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { prisma } from "@/lib/prisma";
import { policyWindow } from "@/lib/prize-authorization/code";
import { currentPersonalCodes } from "@/lib/prize-authorization/personal-codes";
import { policySchema, scopeKeys } from "@/lib/prize-authorization/policy";
import {
  getPrizeAdministrator,
  readPrizePolicy,
  savePrizePolicy,
} from "@/lib/prize-authorization/service";

export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  if (!(await getPrizeAdministrator(req)))
    return apiError("FORBIDDEN", "Solo administración puede consultar las claves.", undefined, 403);
  try {
    const { row, policy } = await readPrizePolicy();
    const window = policyWindow(policy, scopeKeys[0]);
    const current = row ? await currentPersonalCodes() : null;
    const codes = new Map(current?.collaborators.map((item) => [item.userId, item]) ?? []);
    const users = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        person: { select: { name: true, active: true } },
        prizeAuthorizationCredential: { select: { enabled: true, revision: true } },
      },
    });
    const collaborators = users.map((user) => ({
      userId: user.id,
      username: user.username,
      name: user.person.name,
      role: user.role,
      active: user.person.active,
      enabled: user.prizeAuthorizationCredential?.enabled ?? false,
      credentialRevision: user.prizeAuthorizationCredential?.revision ?? 0,
      code: codes.get(user.id)?.code ?? null,
    }));
    return apiOk(
      {
        policy,
        revision: row?.revision ?? 0,
        collaborators,
        requiredNow: window.required,
        validUntil: window.validUntil,
        updatedAt: row?.updatedAt ?? null,
      },
      200,
      noCache
    );
  } catch {
    return apiError(
      "CONFIG_UNAVAILABLE",
      "No se pudo cargar la configuración. Verifica la migración de autorización de premios.",
      undefined,
      503,
      noCache
    );
  }
}
export async function PUT(req: NextRequest) {
  const admin = await getPrizeAdministrator(req);
  if (!admin)
    return apiError(
      "FORBIDDEN",
      "Solo administración puede configurar las claves.",
      undefined,
      403
    );
  const parsed = z
    .object({
      policy: policySchema,
      expectedRevision: z.number().int().min(0),
      rotate: z.boolean().optional(),
    })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Revisa la configuración.", parsed.error.flatten(), 400);
  try {
    const row = await savePrizePolicy(
      parsed.data.policy,
      admin.userId,
      parsed.data.expectedRevision,
      parsed.data.rotate
    );
    await prisma.eventLog.create({
      data: {
        type: "PRIZE_OTP_CONFIG_UPDATED",
        message: "Configuración de claves de canje actualizada",
        metadata: JSON.stringify({
          userId: admin.userId,
          revision: row.revision,
          enabled: parsed.data.policy.enabled,
          rotated: !!parsed.data.rotate,
          autoEnabledCount: row.autoEnabledCount,
        }),
      },
    });
    return apiOk({ saved: true, autoEnabledCount: row.autoEnabledCount }, 200, noCache);
  } catch (e) {
    const conflict =
      (e instanceof Error && e.message === "CONFIG_CONFLICT") ||
      (e as { code?: string })?.code === "P2002";
    return apiError(
      conflict ? "CONFIG_CONFLICT" : "CONFIG_SAVE_FAILED",
      conflict
        ? "La configuración cambió. Recarga antes de guardar."
        : "No se pudo guardar la configuración.",
      undefined,
      conflict ? 409 : 500
    );
  }
}
