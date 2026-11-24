import type { PrizeGameData } from './client';
import { readPrizeGame } from './read';
import { PrizeGameError } from './contracts';
import { ROULETTE_CONFIG } from '@/lib/experiences/roulette-config';

export type InitialGame = { data: PrizeGameData; error?: never } | { data?: never; error: { message: string; code?: string } };

/** A request-scoped, bounded read. Never reveal or cache a token on page entry. */
export async function loadPublicGame(tokenId: string): Promise<InitialGame> {
  if (!tokenId) return { error: { message: 'No se ha proporcionado un token' } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      readPrizeGame(tokenId),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PrizeGameError('GAME_TIMEOUT', 'El servidor tardó demasiado. Inténtalo nuevamente.', 503)), ROULETTE_CONFIG.requestTimeoutMs); }),
    ]);
    return { data };
  } catch (error) {
    if (error instanceof PrizeGameError) return { error: { message: error.message, code: error.code } };
    console.error('[PUBLIC_GAME] No se pudo cargar la experiencia', error);
    return { error: { message: 'No se pudo conectar con el servidor. Inténtalo nuevamente.', code: 'GAME_FAILED' } };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
