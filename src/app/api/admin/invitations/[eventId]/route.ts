import { updateEventSchema } from "@/lib/invitations/input";
import { invitationDay } from "@/lib/invitations/calendar";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { getEvent, updateEvent, getEventStats } from "@/lib/invitations/service";

export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const session = await invitationOperator(req, false);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const event = await getEvent(params.eventId);
    if (!event) return apiError("NOT_FOUND", "Event not found", undefined, 404);

    const stats = await getEventStats(params.eventId);
    return apiOk({ ...event, stats });
  } catch (error) {
    return invitationFailure(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const body = await req.json().catch(() => ({}));
    const parsed = updateEventSchema.safeParse(body);
    if (!parsed.success)
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

    const data: any = { ...parsed.data };
    if (data.date) {
      data.date = invitationDay(data.date).toJSDate();
    }

    const updated = await updateEvent(params.eventId, data);
    return apiOk({ ok: true, event: updated });
  } catch (error) {
    return invitationFailure(error);
  }
}
