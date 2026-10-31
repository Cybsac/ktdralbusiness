import { apiError } from "@/lib/apiError";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
// Historical maintenance URL. Reserving no longer modifies manual disabled flags.
export async function POST(request: Request) {
  const gate = await requirePrizeManagement(request);
  if (gate) return gate;
  return apiError(
    "RESERVATION_MIGRATION_RETIRED",
    "Las reservas se gestionan automáticamente por sus vínculos. Esta migración ya no debe ejecutarse.",
    undefined,
    410
  );
}
