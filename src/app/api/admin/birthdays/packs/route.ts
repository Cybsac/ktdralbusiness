import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { birthdayPackAdministrator } from "@/lib/birthdays/managementAuth";
import { birthdayPackDto } from "@/lib/birthdays/pack-catalog";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!(await birthdayPackAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const packs = await prisma.birthdayPack.findMany({ orderBy: { name: "asc" } });
  return apiOk({ packs: packs.map(birthdayPackDto) }, 200, {
    "Cache-Control": "private, no-store",
  });
}
