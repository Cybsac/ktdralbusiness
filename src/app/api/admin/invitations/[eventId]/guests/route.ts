import { guestSchema, bulkGuestSchema } from "@/lib/invitations/input";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { addGuest, bulkAddGuests, listGuests } from "@/lib/invitations/service";

export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const session = await invitationOperator(req, false);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const guests = await listGuests(params.eventId);
    return apiOk({ guests });
  } catch (error) {
    return invitationFailure(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const body = await req.json().catch(() => ({}));

    // Support both single guest and bulk
    if (body.guests && Array.isArray(body.guests)) {
      const parsed = bulkGuestSchema.safeParse(body);
      if (!parsed.success)
        return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);
      const results = await bulkAddGuests(params.eventId, parsed.data.guests);
      return apiOk({ ok: true, guests: results, count: results.length }, 201);
    }

    const parsed = guestSchema.safeParse(body);
    if (!parsed.success)
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

    const guest = await addGuest(params.eventId, parsed.data);
    return apiOk({ ok: true, guest }, 201);
  } catch (error) {
    return invitationFailure(error);
  }
}
