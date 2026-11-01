import { apiOk, apiError } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { cleanupBirthdayCardsOnce } from "@/lib/birthdays/card-maintenance";
export async function POST(req: Request) {
  if (!(await birthdayAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  return apiOk(await cleanupBirthdayCardsOnce());
}
