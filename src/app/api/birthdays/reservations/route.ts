import { reservationCreateSchema } from "@/lib/birthdays/reservation-input";
import { NextRequest } from "next/server";
import { birthdayFailure } from "@/lib/birthdays/http";
import { apiError, apiOk } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";
import { createReservation } from "@/lib/birthdays/service";
import { signClientSecret } from "@/lib/birthdays/clientAuth";
import { isBirthdaysEnabledPublic } from "@/lib/featureFlags";
import { corsHeadersFor } from "@/lib/cors";
import { parseDateStringToLima, limaDateTimeToJSDate } from "@/lib/birthdays/service";

const CreateReservationSchema = reservationCreateSchema;

export async function POST(req: NextRequest) {
  const cors = corsHeadersFor(req as unknown as Request);
  // Feature flag: gate public birthdays creation
  if (!isBirthdaysEnabledPublic()) {
    return apiError("NOT_FOUND", "Not found", undefined, 404, cors);
  }
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
  const rateLimit = checkRateLimit(`birthdays:reservations:create:${ip}`);
  if (!rateLimit.ok) return apiError("RATE_LIMITED", "Demasiadas solicitudes", undefined, 429, { ...cors, "Retry-After": String(rateLimit.retryAfterSeconds) });
  try {
    const body = await req.json();
    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400, cors);
    }
    const {
      celebrantName,
      phone,
      documento,
      email,
      date,
      timeSlot,
      packId,
      guestsPlanned,
      wantsPhotoSession,
      referrerId,
    } = parsed.data;
    const dt = limaDateTimeToJSDate(parseDateStringToLima(date));
    if (!isFinite(dt.getTime())) return apiError("INVALID_DATE", "invalid date", undefined, 400);

    const created = await createReservation({
      celebrantName,
      phone,
      documento,
      email: email || undefined,
      date: dt,
      timeSlot,
      packId,
      guestsPlanned,
      wantsPhotoSession,
      referrerId,
      reservationSource: "PUBLIC",
    });

    // Build a safe DTO (omit heavy relations and internal fields not needed client-side)
    const dto = {
      id: created.id,
      celebrantName: created.celebrantName,
      phone: created.phone,
      documento: created.documento,
      email: created.email ?? null,
      date: created.date.toISOString().slice(0, 10),
      timeSlot: created.timeSlot,
      pack: {
        id: created.pack.id,
        name: created.pack.name,
        qrCount: created.pack.qrCount,
        bottle: created.pack.bottle,
        featured: created.pack.featured,
      },
      guestsPlanned: created.guestsPlanned,
      wantsPhotoSession: created.wantsPhotoSession,
      status: created.status,
      tokensGeneratedAt: created.tokensGeneratedAt ? created.tokensGeneratedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    };
    const clientSecret = signClientSecret(created.id);
    return apiOk({ ok: true, ...dto, clientSecret }, 201, cors);
  } catch (e) {
    return birthdayFailure(e, cors);
  }
}

export async function OPTIONS(req: NextRequest) {
  const cors = corsHeadersFor(req as unknown as Request);
  return new Response(null, { status: 204, headers: cors });
}
