import { apiError } from "@/lib/apiError";

import { PrizeGameError } from "./contracts";
export function gameFailure(error: unknown) {
  if (error instanceof PrizeGameError)
    return apiError(error.code, error.message, undefined, error.status);
  console.error("[PRIZE_GAME]", error);
  return apiError(
    "GAME_FAILED",
    "No se pudo completar la operación. Intenta nuevamente.",
    undefined,
    500
  );
}
