import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { birthdayPackAdministrator } from "@/lib/birthdays/managementAuth";
import { birthdayPackDto, packUpdateSchema } from "@/lib/birthdays/pack-catalog";
import { prisma } from "@/lib/prisma";
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await birthdayPackAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const parsed = packUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Revisa los datos del paquete", parsed.error.flatten(), 400);
  if (!Object.keys(parsed.data).length) return apiError("NO_FIELDS", "Sin cambios", undefined, 400);
  try {
    const { perks, ...fields } = parsed.data;
    const pack = await prisma.birthdayPack.update({
      where: { id: params.id },
      data: { ...fields, ...(perks ? { perks: JSON.stringify(perks) } : {}) },
    });
    return apiOk({ pack: birthdayPackDto(pack) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2025") return apiError("NOT_FOUND", "El paquete ya no existe", undefined, 404);
    if (code === "P2002")
      return apiError("NAME_TAKEN", "Ya existe un paquete con ese nombre", undefined, 409);
    console.error("[birthday packs] update failed", error);
    return apiError("UPDATE_FAILED", "No se pudo guardar el paquete", undefined, 500);
  }
}
