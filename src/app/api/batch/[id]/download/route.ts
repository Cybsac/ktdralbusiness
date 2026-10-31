import { downloadBatch } from "@/lib/prize-games/batch-export";
import { gameFailure } from "@/lib/prize-games/http";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePrizeManagement(req);
  if (gate) return gate;
  try {
    return await downloadBatch(params.id, req.url, new URL(req.url).searchParams.get("qr") === "1");
  } catch (error) {
    return gameFailure(error);
  }
}
