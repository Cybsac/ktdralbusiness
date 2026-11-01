import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { purgeBirthdayCards } from "@/lib/birthdays/retention";
import { birthdayFailure } from "@/lib/birthdays/http";
export async function POST(req: NextRequest) {
  const session = await birthdayAdministrator(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const parsed = z
    .object({ reservationIds: z.array(z.string().min(1)).min(1) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Selecciona reservas válidas", undefined, 400);
  try {
    return apiOk(await purgeBirthdayCards(parsed.data.reservationIds, session.userId));
  } catch (error) {
    return birthdayFailure(error);
  }
}
