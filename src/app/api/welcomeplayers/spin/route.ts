import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { buildSpinResult } from "@/lib/welcomeplayers/engine";
import { getWelcomePlayersSpin, recordWelcomePlayersSpin } from "@/lib/welcomeplayers/store";
import { logEvent } from "@/lib/log";
import { getActiveWelcomePlayersPrizes } from "@/lib/welcomeplayers/repository";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body?.requestId;
    if (requestId !== undefined && (typeof requestId !== "string" || !/^[0-9a-f]{32}$/i.test(requestId))) {
      return apiError("INVALID_INPUT", "No se pudo identificar el giro.", undefined, 400);
    }
    if (requestId) {
      const existing = await getWelcomePlayersSpin(requestId);
      if (existing) return apiOk(existing);
    }
    const prizes = await getActiveWelcomePlayersPrizes();
    if (prizes.length < 3) {
      return apiError(
        "NOT_ENOUGH_PRIZES",
        "Necesitamos al menos 3 premios activos para activar la ruleta",
        { minimumRequired: 3, activePrizes: prizes.length },
        409
      );
    }
    const result = buildSpinResult(prizes);
    if (requestId) result.spinId = requestId;
    try {
      await recordWelcomePlayersSpin(result);
    } catch (error) {
      if (requestId && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await getWelcomePlayersSpin(requestId);
        if (existing) return apiOk(existing);
      }
      throw error;
    }

    await logEvent("WELCOMEPLAYERS_SPIN", "WelcomePlayers spin", {
      spinId: result.spinId,
      prizeId: result.prize.id,
      label: result.prize.label,
      prizeIndex: result.prizeIndex,
      turns: result.turns,
    }).catch(() => {});

    return apiOk({
      spinId: result.spinId,
      prize: result.prize,
      prizeIndex: result.prizeIndex,
      turns: result.turns,
      rotation: result.rotation,
      createdAt: result.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SPIN_FAILED";
    return apiError("SPIN_FAILED", "No se pudo resolver el giro", { reason: message }, 500);
  }
}
