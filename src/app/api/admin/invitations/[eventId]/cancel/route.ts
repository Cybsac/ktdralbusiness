import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { cancelEvent } from "@/lib/invitations/service";

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const event = await cancelEvent(params.eventId);
    return apiOk({ ok: true, event });
  } catch (error) {
    return invitationFailure(error);
  }
}
