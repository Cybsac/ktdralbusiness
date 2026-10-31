import { apiOk } from "@/lib/apiError";
import { gameFailure } from "@/lib/prize-games/http";
import { readPrizeGame } from "@/lib/prize-games/read";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { tokenId: string } }) {
  try {
    return apiOk(await readPrizeGame(params.tokenId), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return gameFailure(error);
  }
}
