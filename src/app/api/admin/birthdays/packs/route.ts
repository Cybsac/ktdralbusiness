import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { birthdayPackDto } from "@/lib/birthdays/pack-catalog";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!(await birthdayAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const packs = await prisma.birthdayPack.findMany({ orderBy: { name: "asc" } });
  return apiOk({ packs: packs.map(birthdayPackDto) }, 200, {
    "Cache-Control": "private, no-store",
  });
}
