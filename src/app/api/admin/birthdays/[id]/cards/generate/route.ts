import { birthdayFailure } from "@/lib/birthdays/http";
import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { ensureBirthdayCards } from "@/lib/birthdays/cards";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { getBirthdayQrBaseUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await birthdayManager(req)))
      return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
    const baseUrl = getBirthdayQrBaseUrl(req.url);
    const result = await ensureBirthdayCards(params.id, baseUrl, {
      regenerate: new URL(req.url).searchParams.get("regenerate") === "1",
    });
    return apiOk({ ok: true, ...result }, 200);
  } catch (error) {
    return birthdayFailure(error);
  }
}
