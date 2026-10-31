import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { isTwoPhaseRedemptionEnabled } from "@/lib/featureFlags";
import { gameFailure } from "@/lib/prize-games/http";
import { revealPrizeGame } from "@/lib/prize-games/reveal";

export async function POST(req: NextRequest, { params }: { params: { tokenId: string } }) {
  if (!params.tokenId) return apiError("TOKEN_ID_REQUIRED", "tokenId requerido", undefined, 400);
  if (!isTwoPhaseRedemptionEnabled())
    return apiError("TWO_PHASE_DISABLED", "Flujo two-phase desactivado", undefined, 409);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.prizeId !== undefined && typeof body.prizeId !== "string")
      return apiError("INVALID_BODY", "Datos inválidos", undefined, 400);
    return apiOk(await revealPrizeGame(params.tokenId, body?.prizeId));
  } catch (error) {
    return gameFailure(error);
  }
}
