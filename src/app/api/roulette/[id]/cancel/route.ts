import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const managementGate = await requirePrizeManagement(_req);
  if (managementGate) return managementGate;
  const { id } = params;
  if (!id) return apiError("ID_REQUIRED", "ID requerido", undefined, 400);
  try {
    const session = await (prisma as any).rouletteSession.findUnique({ where: { id } });
    if (!session) return apiError("NOT_FOUND", "Sesión no encontrada", undefined, 404);
    if (session.status === "ACTIVE") {
      const updated = await (prisma as any).rouletteSession.update({
        where: { id },
        data: { status: "CANCELLED", finishedAt: new Date() },
        select: { status: true, finishedAt: true },
      });
      await logEvent("ROULETTE_CANCEL", "Ruleta cancelada", { sessionId: id });
      return apiOk({ status: updated.status, finishedAt: updated.finishedAt });
    }
    return apiOk({ status: session.status, finishedAt: session.finishedAt });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ROULETTE_CANCEL_ERROR]", e);
    return apiError("CANCEL_FAILED", "Cancelación fallida", undefined, 500);
  }
}
