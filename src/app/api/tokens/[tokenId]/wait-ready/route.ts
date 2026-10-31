import { apiOk } from "@/lib/apiError";
import { prisma } from "@/lib/prisma";
import { gameAvailability } from "@/lib/prize-games/availability";
import { PrizeGameError } from "@/lib/prize-games/contracts";
import { gameFailure } from "@/lib/prize-games/http";
import { assertGameReservation, gameTokenInclude } from "@/lib/prize-games/reservations";
export const dynamic = "force-dynamic";
// Compatibility endpoint: a single status read; no database polling loop.
export async function GET(_req: Request, { params }: { params: { tokenId: string } }) {
  try {
    const token = await prisma.token.findUnique({
      where: { id: params.tokenId },
      include: gameTokenInclude,
    });
    if (!token) throw new PrizeGameError("TOKEN_NOT_FOUND", "Token no encontrado", 404);
    const unavailable = gameAvailability(token);
    if (unavailable) throw unavailable;
    await assertGameReservation(prisma, token);
    return apiOk({ ready: true, tokenId: token.id, prizeKey: token.prize.key, waitedMs: 0 }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return gameFailure(error);
  }
}
