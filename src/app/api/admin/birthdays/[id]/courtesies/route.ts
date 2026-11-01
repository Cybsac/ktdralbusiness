import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { birthdayFailure } from "@/lib/birthdays/http";
import { requirePrizeAuthorization, getPrizeActor } from "@/lib/prize-authorization/service";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { setCourtesyStatus } from "@/lib/birthdays/service";

const BodySchema = z.object({
  type: z.string().min(1),
  status: z.enum(["pending", "delivered"]).default("pending"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success)
    return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

  let responsibleId: string | undefined;
  if (parsed.data.status === "delivered") {
    const prizeGate = await requirePrizeAuthorization(req, "birthdays");
    if (prizeGate) return prizeGate;
    responsibleId = getPrizeActor(req).userId;
  } else {
    const session = await birthdayAdministrator(req);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
    responsibleId = session?.userId;
  }
  try {
    return apiOk(
      await setCourtesyStatus(params.id, parsed.data.type, parsed.data.status, responsibleId)
    );
  } catch (error) {
    return birthdayFailure(error);
  }
}
