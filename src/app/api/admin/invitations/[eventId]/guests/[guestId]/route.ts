import { updateGuestSchema } from "@/lib/invitations/input";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { updateGuest, removeGuest } from "@/lib/invitations/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { eventId: string; guestId: string } }
) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const body = await req.json().catch(() => ({}));
    const parsed = updateGuestSchema.safeParse(body);
    if (!parsed.success)
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

    const guest = await updateGuest(params.eventId, params.guestId, parsed.data);
    return apiOk({ ok: true, guest });
  } catch (error) {
    return invitationFailure(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { eventId: string; guestId: string } }
) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    await removeGuest(params.eventId, params.guestId);
    return apiOk({ ok: true });
  } catch (error) {
    return invitationFailure(error);
  }
}
