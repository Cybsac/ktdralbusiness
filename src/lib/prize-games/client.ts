import { prizeAuthorizedFetch } from "@/lib/prize-authorization/client";

import type { readPrizeGame } from "./read";
import type { revealPrizeGame } from "./reveal";

export class GameRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
async function responseBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new GameRequestError(body?.message || fallback, response.status, body?.code);
  if (!body) throw new GameRequestError("El servidor devolvió una respuesta incompleta", 502);
  return body as T;
}
export type PrizeGameData = Awaited<ReturnType<typeof readPrizeGame>>;
export type PrizeGameReveal = Omit<Awaited<ReturnType<typeof revealPrizeGame>>, "timestamps"> & {
  timestamps: { revealedAt: string };
};
/** Retry reads only for transient failures. Mutations recover through their server contract. */
export async function loadPrizeGame(tokenId: string, signal: AbortSignal): Promise<PrizeGameData> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await responseBody<PrizeGameData>(
        await fetch(`/api/tokens/${encodeURIComponent(tokenId)}/roulette-data`, {
          signal,
          cache: "no-store",
        }),
        "No se pudo cargar el juego"
      );
    } catch (error) {
      if (signal.aborted) throw new Error("Tiempo de espera agotado al cargar el juego.");
      if (attempt >= 1 || (error instanceof GameRequestError && error.status < 500)) throw error;
    }
  }
}
export async function revealGameResult(tokenId: string, fallback: string) {
  return responseBody<PrizeGameReveal>(
    await fetch(`/api/token/${encodeURIComponent(tokenId)}/reveal`, { method: "POST" }),
    fallback
  );
}
export async function deliverGamePrize(tokenId: string) {
  return responseBody<{ timestamps: { deliveredAt: string } }>(
    await prizeAuthorizedFetch(`/api/token/${encodeURIComponent(tokenId)}/deliver`, {
      method: "POST",
    }),
    "No se pudo registrar la entrega"
  );
}
