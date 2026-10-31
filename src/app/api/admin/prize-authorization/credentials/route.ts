import { notifyPrizeAuthorizationChanged } from "@/lib/prize-authorization/realtime";
import { randomBytes } from "crypto";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { prisma } from "@/lib/prisma";
import { enableMissingPrizeCredentials } from "@/lib/prize-authorization/credentials";
import { lockPrizeConfiguration } from "@/lib/prize-authorization/personal-codes";
import { getPrizeAdministrator } from "@/lib/prize-authorization/service";

export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "private, no-store" };
export async function PUT(req: Request) {
  const admin = await getPrizeAdministrator(req);
  if (!admin)
    return apiError(
      "FORBIDDEN",
      "Solo administración puede gestionar claves personales.",
      undefined,
      403
    );
  const parsed = z
    .object({
      userId: z.string().min(1),
      enabled: z.boolean(),
      rotate: z.boolean().optional(),
      expectedRevision: z.number().int().min(0),
    })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Revisa los datos del colaborador.", undefined, 400);
  try {
    await prisma.$transaction(async (tx) => {
      if (!(await lockPrizeConfiguration(tx))) throw new Error("SETUP_REQUIRED");
      const user = await tx.user.findUnique({
        where: { id: parsed.data.userId },
        select: { person: { select: { active: true } } },
      });
      if (!user || (parsed.data.enabled && !user.person.active))
        throw new Error("USER_UNAVAILABLE");
      const existing = await tx.prizeAuthorizationCredential.findUnique({
        where: { userId: parsed.data.userId },
      });
      if ((existing?.revision ?? 0) !== parsed.data.expectedRevision)
        throw new Error("CONFIG_CONFLICT");
      if (existing)
        await tx.prizeAuthorizationCredential.update({
          where: { id: existing.id },
          data: {
            enabled: parsed.data.enabled,
            revision: { increment: 1 },
            updatedBy: admin.userId,
            ...(parsed.data.rotate ? { secret: randomBytes(32).toString("hex") } : {}),
          },
        });
      else
        await tx.prizeAuthorizationCredential.create({
          data: {
            userId: parsed.data.userId,
            enabled: parsed.data.enabled,
            secret: randomBytes(32).toString("hex"),
            updatedBy: admin.userId,
          },
        });
      await tx.eventLog.create({
        data: {
          type: "PRIZE_PERSONAL_CODE_UPDATED",
          message: "Clave personal de canjes actualizada",
          metadata: JSON.stringify({
            actorId: admin.userId,
            userId: parsed.data.userId,
            enabled: parsed.data.enabled,
            rotated: !!parsed.data.rotate,
          }),
        },
      });
    });
    notifyPrizeAuthorizationChanged(parsed.data.userId);
    return apiOk({ saved: true }, 200, noCache);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return apiError(
      code || "SAVE_FAILED",
      code === "CONFIG_CONFLICT"
        ? "La clave cambió. Recarga antes de editar."
        : code === "SETUP_REQUIRED"
          ? "Guarda primero la configuración general."
          : "No se pudo actualizar la clave del colaborador.",
      undefined,
      code === "CONFIG_CONFLICT" ? 409 : 400
    );
  }
}
export async function POST(req: Request) {
  const admin = await getPrizeAdministrator(req);
  if (!admin)
    return apiError("FORBIDDEN", "Solo administración puede habilitar claves.", undefined, 403);
  const parsed = z
    .object({ action: z.literal("enable_missing") })
    .strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_BODY", "Acción inválida.", undefined, 400);
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!(await lockPrizeConfiguration(tx))) throw new Error("SETUP_REQUIRED");
      const count = await enableMissingPrizeCredentials(tx, admin.userId);
      await tx.eventLog.create({
        data: {
          type: "PRIZE_PERSONAL_CODES_ENABLED",
          message: "Claves personales habilitadas para cuentas sin clave",
          metadata: JSON.stringify({ actorId: admin.userId, count }),
        },
      });
      return count;
    });
    notifyPrizeAuthorizationChanged();
    return apiOk({ enabled: result }, 200, noCache);
  } catch {
    return apiError("SETUP_REQUIRED", "Guarda primero la configuración general.", undefined, 400);
  }
}
