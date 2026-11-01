import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/apiError";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { birthdayFailure } from "@/lib/birthdays/http";
import { cancelReservation } from "@/lib/birthdays/service";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500))
      return apiError("INVALID_BODY", "Motivo inválido", undefined, 400);
    return apiOk(await cancelReservation(params.id, body.reason, session.userId));
  } catch (error) {
    return birthdayFailure(error);
  }
}
