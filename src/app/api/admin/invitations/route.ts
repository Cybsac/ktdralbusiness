import { createEventSchema } from "@/lib/invitations/input";
import { invitationDay } from "@/lib/invitations/calendar";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { listEvents, createEvent, getGlobalInvitationStats } from "@/lib/invitations/service";

const ListSchema = z.object({
  status: z.string().optional(),
  dateFilter: z.enum(["all", "upcoming", "past", "today"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userSession = await invitationOperator(req, false);
    if (!userSession) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const { searchParams } = new URL(req.url);

    // Global stats request
    if (searchParams.get("stats") === "1") {
      const stats = await getGlobalInvitationStats();
      return apiOk(stats);
    }

    const parsed = ListSchema.safeParse({
      status: searchParams.get("status") || undefined,
      dateFilter: searchParams.get("dateFilter") || undefined,
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
    });
    if (!parsed.success)
      return apiError("INVALID_QUERY", "Invalid query", parsed.error.flatten(), 400);

    const res = await listEvents(parsed.data, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return apiOk(res);
  } catch (error) {
    return invitationFailure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await invitationOperator(req, true);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const body = await req.json().catch(() => ({}));
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success)
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

    const { date, ...rest } = parsed.data;
    const dateObj = invitationDay(date).toJSDate(); // Lima timezone

    const event = await createEvent({
      ...rest,
      date: dateObj,
      createdBy: session.userId,
    });

    return apiOk({ ok: true, event }, 201);
  } catch (error) {
    return invitationFailure(error);
  }
}
