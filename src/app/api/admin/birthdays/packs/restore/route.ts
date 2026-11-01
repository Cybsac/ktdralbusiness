import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import {
  restoreBirthdayPackCatalog,
  saveBirthdayPackCatalog,
  birthdayPackDto,
} from "@/lib/birthdays/pack-catalog";
export async function POST(req: NextRequest) {
  if (!(await birthdayAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  try {
    const packs = await restoreBirthdayPackCatalog();
    return apiOk({ restored: true, count: packs.length, packs: packs.map(birthdayPackDto) });
  } catch {
    return apiError(
      "RESTORE_PACKS_FAILED",
      "No se pudo restaurar la configuración de paquetes",
      undefined,
      500
    );
  }
}
/** Explicit administrative API for updating the restore baseline; never performed by a GET. */
export async function PUT(req: NextRequest) {
  if (!(await birthdayAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  await saveBirthdayPackCatalog();
  return apiOk({ saved: true });
}
