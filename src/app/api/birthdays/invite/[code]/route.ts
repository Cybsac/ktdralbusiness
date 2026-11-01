import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError } from "@/lib/apiError";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { corsHeadersFor } from "@/lib/cors";
import { registerBirthdayArrival } from "@/lib/birthdays/arrival";
import { birthdayFailure } from "@/lib/birthdays/http";
import { birthdayDateKey } from "@/lib/birthdays/calendar";
import { BIRTHDAY_POLICY as P } from "@/lib/birthdays/policy";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const headers = { ...corsHeadersFor(req), "Cache-Control": "private, no-store" };
  try {
    const session = await getPrizeOperator(req);
    const token = await prisma.inviteToken.findUnique({
      where: { code: params.code },
      include: { reservation: { include: { pack: true } } },
    });
    if (!token) return apiError("NOT_FOUND", "Token no encontrado", undefined, 404, headers);
    const r = token.reservation,
      firstName = r.celebrantName.trim().split(/\s+/)[0];
    const base = {
      code: token.code,
      kind: token.kind,
      status: token.status,
      expiresAt: token.expiresAt.toISOString(),
      celebrantName: r.celebrantName,
      packName: r.pack.name,
      packBottle: r.specialBottle || r.pack.bottle,
      guestsPlanned: r.guestsPlanned,
      isHost: token.kind === P.legacyTokenKind,
      multiUse: token.maxUses ? { used: token.usedCount, max: token.maxUses } : null,
      packGuestLimit: token.maxUses || r.pack.qrCount,
    };
    if (!session)
      return apiOk(
        {
          public: true,
          message: `Estás invitad@ a la fiesta de ${firstName}. Muestra este código al ingresar y prepárate para celebrar.`,
          token: { ...base, celebrantName: firstName, celebrantFullName: r.celebrantName },
          hostArrivedAt: r.hostArrivedAt?.toISOString() || null,
          reservation: {
            date: r.date.toISOString(),
            timeSlot: r.timeSlot,
            guestArrivals: r.guestArrivals,
            statusReservation: r.status,
          },
          isAdmin: false,
        },
        200,
        headers
      );
    const last = await prisma.tokenRedemption.findFirst({
      where: {
        reservationId: r.id,
        token: { kind: P.universalTokenKind },
        OR: [{ location: null }, { NOT: { location: { startsWith: "host" } } }],
      },
      orderBy: { redeemedAt: "desc" },
      select: { redeemedAt: true },
    });
    return apiOk(
      {
        public: false,
        token: base,
        isAdmin: session.role === "ADMIN",
        reservation: {
          reservationId: r.id,
          date: birthdayDateKey(r.date),
          timeSlot: r.timeSlot,
          phone: r.phone,
          documento: r.documento,
          email: r.email,
          statusReservation: r.status,
          tokensGeneratedAt: r.tokensGeneratedAt?.toISOString() || null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          hostArrivedAt: r.hostArrivedAt?.toISOString() || null,
          guestArrivals: r.guestArrivals,
          lastGuestArrivalAt: last?.redeemedAt.toISOString() || null,
        },
      },
      200,
      headers
    );
  } catch (error) {
    return birthdayFailure(error, headers);
  }
}
const arrivalSchema = z.object({
  role: z.enum(P.arrivalRoles),
  device: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  operationKey: z.string().uuid().optional(),
});
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const headers = { ...corsHeadersFor(req), "Cache-Control": "private, no-store" };
  const session = await getPrizeOperator(req);
  if (!session)
    return apiError(
      "UNAUTHORIZED",
      "Inicia sesión para registrar ingresos",
      undefined,
      401,
      headers
    );
  const parsed = arrivalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Datos de ingreso inválidos", undefined, 400, headers);
  try {
    const result = await registerBirthdayArrival(
      params.code,
      parsed.data.role,
      { device: parsed.data.device, location: parsed.data.location },
      session.userId,
      parsed.data.operationKey
    );
    return apiOk(
      {
        token: {
          code: result.token.code,
          kind: result.token.kind,
          status: result.token.status,
          usedCount: result.token.usedCount,
          maxUses: result.token.maxUses,
        },
        arrival: {
          hostArrivedAt: result.reservation.hostArrivedAt?.toISOString() || null,
          guestArrivals: result.reservation.guestArrivals,
          lastGuestArrivalAt: result.lastGuestArrivalAt?.toISOString() || null,
        },
      },
      200,
      headers
    );
  } catch (error) {
    return birthdayFailure(error, headers);
  }
}
