import { invitationDay, invitationToday } from "@/lib/invitations/calendar";
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { findInvitationByCode, markArrival, getEventStats } from "@/lib/invitations/service";
import { prisma } from "@/lib/prisma";

async function getLastArrival(eventId: string) {
  const lastArrival = await prisma.specialInvitation.findFirst({
    where: { eventId, arrivedAt: { not: null } },
    orderBy: { arrivedAt: "desc" },
    select: { arrivedAt: true, guestName: true },
  });
  return lastArrival
    ? {
        arrivedAt: lastArrival.arrivedAt?.toISOString(),
        guestName: lastArrival.guestName,
      }
    : null;
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const inv = await findInvitationByCode(params.code);
    if (!inv) return apiError("NOT_FOUND", "Invitation not found", undefined, 404);

    const session = await invitationOperator(req);
    const isStaff = !!session;

    // Public data (always visible)
    const publicData: any = {
      code: inv.code,
      eventStatus: inv.event.status,
      guestName: inv.guestName,
      eventName: inv.event.name,
      eventDate: inv.event.date.toISOString(),
      eventTimeSlot: inv.event.timeSlot,
      eventLocation: inv.event.location,
      guestCategory: inv.guestCategory,
      courtesyNote: inv.courtesyNote,
      status: inv.status,
      arrivedAt: inv.arrivedAt?.toISOString() ?? null,
      // expiresAt is needed by the public UI to render the "expired" banner
      expiresAt: inv.expiresAt?.toISOString() ?? null,
      isStaff: !!isStaff,
      canRegisterArrival:
        inv.event.status === "active" &&
        inv.status === "confirmed" &&
        !inv.arrivedAt &&
        !!inv.expiresAt &&
        inv.expiresAt > new Date() &&
        invitationDay(inv.event.date).hasSame(invitationToday(), "day"),
    };

    // Extended data for staff
    if (isStaff) {
      publicData.guestPhone = inv.guestPhone;
      publicData.guestWhatsapp = inv.guestWhatsapp;
      publicData.guestEmail = inv.guestEmail;
      publicData.guestDni = inv.guestDni;
      publicData.additionalNote = inv.additionalNote;
      publicData.notes = inv.notes;
      publicData.expiresAt = inv.expiresAt?.toISOString() ?? null;
      publicData.validatedBy = inv.validatedBy;

      // Add event statistics for staff
      const eventStats = await getEventStats(inv.eventId);
      publicData.eventStats = {
        total: eventStats.total,
        arrived: eventStats.arrived,
        lastArrival: await getLastArrival(inv.eventId),
      };
    }

    return apiOk(publicData, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return invitationFailure(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const session = await invitationOperator(req);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const result = await markArrival(params.code, session.userId);
    return apiOk({
      ok: true,
      guestName: result.guestName,
      arrivedAt: result.arrivedAt?.toISOString(),
      eventName: result.event.name,
    });
  } catch (error) {
    return invitationFailure(error);
  }
}
