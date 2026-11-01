import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { getBirthdayCards } from "@/lib/birthdays/cards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await birthdayAdministrator(req);
    if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
    const data = await getBirthdayCards(params.id);
    return apiOk({ ok: true, paths: data.paths });
  } catch (e: any) {
    return apiError(
      "INTERNAL_ERROR",
      "Error listando tarjetas",
      { message: String(e?.message || e) },
      500
    );
  }
}
