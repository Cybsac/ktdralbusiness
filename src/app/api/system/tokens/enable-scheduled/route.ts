import { apiOk } from "@/lib/apiError";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
// Compatibility adapter: validity is evaluated from validFrom/startTime at request time.
// Never turn disabled=false here: disabled now exclusively represents an explicit block.
export async function POST(req: Request) {
  const gate = await requirePrizeManagement(req);
  if (gate) {
    const cron = req.headers.get("x-cron-secret");
    if (!cron || !process.env.CRON_SECRET || cron !== process.env.CRON_SECRET) return gate;
  }
  return apiOk({ updated: 0, automaticValidity: true, manualBlocksPreserved: true });
}
