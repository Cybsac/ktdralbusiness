import { apiOk } from "@/lib/apiError";
import { getPrizeAdminData } from "@/lib/prize-games/admin-data";
import { gameFailure } from "@/lib/prize-games/http";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const gate = await requirePrizeManagement(req);
  if (gate) return gate;
  try {
    return apiOk(await getPrizeAdminData(), 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return gameFailure(error);
  }
}
