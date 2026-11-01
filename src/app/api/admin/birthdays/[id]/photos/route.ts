import { birthdayPhotoSchema } from "@/lib/birthdays/photos";
import { birthdayFailure } from "@/lib/birthdays/http";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { attachPhoto } from "@/lib/birthdays/service";

const BodySchema = birthdayPhotoSchema;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayAdministrator(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success)
    return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);

  try {
    return apiOk(await attachPhoto(params.id, parsed.data, session.userId));
  } catch (error) {
    return birthdayFailure(error);
  }
}
