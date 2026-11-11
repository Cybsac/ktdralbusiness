import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { signClientSecret } from "@/lib/birthdays/clientAuth";
import { birthdayFailure } from "@/lib/birthdays/http";
import { verifyBirthdayIdentity } from "@/lib/birthdays/identity-proof";
import { reservationCreateSchema } from "@/lib/birthdays/reservation-input";
import {
  createReservation,
  limaDateTimeToJSDate,
  parseDateStringToLima,
} from "@/lib/birthdays/service";
import { corsHeadersFor } from "@/lib/cors";
import { isBirthdaysEnabledPublic } from "@/lib/featureFlags";
import { checkRateLimit } from "@/lib/rateLimit";

const CreateReservationSchema = reservationCreateSchema.extend({
  identityProof: z.string().min(1).max(512),
});

export async function POST(req: NextRequest) {
  const cors = corsHeadersFor(req as unknown as Request);
  // Feature flag: gate public birthdays creation
  if (!isBirthdaysEnabledPublic()) {
    return apiError("NOT_FOUND", "Not found", undefined, 404, cors);
  }
  const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown";
  const rateLimit = checkRateLimit(`birthdays:reservations:create:${ip}`);
  if (!rateLimit.ok)
    return apiError("RATE_LIMITED", "Demasiadas solicitudes", undefined, 429, {
      ...cors,
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  try {
    const body = await req.json();
    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400, cors);
    }
    const {
      celebrantName,
      cardName,
      phone,
      documento,
      email,
      birthDate,
      date,
      timeSlot,
      packId,
      guestsPlanned,
      wantsPhotoSession,
      referrerId,
      identityProof,
    } = parsed.data;
    if (
      !birthDate ||
      !verifyBirthdayIdentity({ documento, name: celebrantName, birthDate }, identityProof)
    ) {
      return apiError(
        "INVALID_IDENTITY",
        "No pudimos validar los datos. Vuelve a consultar tu DNI.",
        undefined,
        400,
        cors
      );
    }
    const dt = limaDateTimeToJSDate(parseDateStringToLima(date));
    if (!isFinite(dt.getTime())) return apiError("INVALID_DATE", "invalid date", undefined, 400);

    const created = await createReservation({
      celebrantName,
      cardName,
      phone,
      documento,
      email: email || undefined,
      birthDate,
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
