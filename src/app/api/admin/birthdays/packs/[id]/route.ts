import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { packUpdateSchema, birthdayPackDto } from "@/lib/birthdays/pack-catalog";
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await birthdayAdministrator(req)))
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
    return apiError(
      (error as { code?: string }).code === "P2002" ? "NAME_TAKEN" : "UPDATE_FAILED",
      "No se pudo guardar el paquete",
      undefined,
      409
    );
  }
}
