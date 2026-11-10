import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/config";
import { apiError } from "@/lib/apiError";
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { reusableGenerationSchema } from "@/lib/reusable-tokens/request";
import { generateReusableToken } from "@/lib/reusable-tokens/generation";
import { reusableFailure } from "@/lib/reusable-tokens/http";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const session = await verifySessionCookie(getSessionCookieFromRequest(req));
  const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
  if (!auth.ok || !session) return apiError("UNAUTHORIZED", "No autorizado", undefined, 401);
  const parsed = reusableGenerationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_INPUT", "Revisa los datos del token", parsed.error.flatten(), 400);
  // A development server may share the production database. Until the running production
  // code understands validFrom, tokens created here could be redeemed early there.
  if (
    (parsed.data.validity.type === "specific_date" ||
      parsed.data.validity.type === "weekly_window") &&
    process.env.NODE_ENV !== "production" &&
    process.env.REUSABLE_SCHEDULED_LOCAL_ENABLED !== "1"
  )
    return apiError(
      "SCHEDULED_LOCAL_DISABLED",
      "La generación programada no está habilitada en este entorno.",
      undefined,
      409
    );
  try {
    const token = await generateReusableToken(parsed.data, session.userId);
    return NextResponse.json(
      {
        success: true,
        token: {
          id: token.id,
          qrUrl: `${getPublicBaseUrl(req.url)}/reusable/${token.id}`,
          prize: {
            id: token.prize.id,
            key: token.prize.key,
            label: token.prize.label,
            color: token.prize.color,
          },
          group: token.group,
          maxUses: token.maxUses,
          usedCount: token.usedCount,
          expiresAt: token.expiresAt,
          validFrom: token.validFrom,
          weekdays: token.weekdays,
          startTime: token.startTime,
          endTime: token.endTime,
          createdAt: token.createdAt,
          deliveryNote: token.deliveryNote,
          redeemedAt: token.redeemedAt,
          deliveredAt: token.deliveredAt,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NO_WEEKLY_OCCURRENCE")
      return apiError(
        error.message,
        "No hay ningún horario seleccionado antes del vencimiento. Revisa los días y la fecha.",
        undefined,
        400
      );
    if (
      error instanceof Error &&
      ["INVALID_EXPIRATION", "INVALID_DATE", "EMPTY_TIME_WINDOW", "INVALID_TIME"].includes(
        error.message
      )
    )
      return apiError(error.message, "Vigencia inválida o vencida", undefined, 400);
    return reusableFailure(error);
  }
}
