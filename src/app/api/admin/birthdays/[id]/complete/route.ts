import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/apiError";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { birthdayFailure } from "@/lib/birthdays/http";
import { completeReservation } from "@/lib/birthdays/service";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  try {
    return apiOk(await completeReservation(params.id, session.userId));
  } catch (error) {
    return birthdayFailure(error);
  }
}
