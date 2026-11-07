import { DateTime } from "luxon";
import { z } from "zod";

import { cluzterGet } from "./client";
import { CluzterError } from "./config";

const dniResponse = z.object({
  DNI: z.string().regex(/^\d{8}$/),
  NOMBRES: z.string().trim().min(1).max(160),
  AP_PAT: z.string().trim().min(1).max(160),
  AP_MAT: z.string().trim().max(160).nullable().optional(),
  FECHA_NAC: z.string().nullable().optional(),
  SEXO: z.string().nullable().optional(),
});
export type Identity = {
  dni: string;
  names: string;
  paternalSurname: string;
  maternalSurname: string | null;
  birthDate: string | null;
  documentSexCode: string | null;
};

/** Lookup only; callers must authorize the use case and decide which fields to return. */
export async function lookupDni(dni: string): Promise<Identity> {
  if (!/^\d{8}$/.test(dni)) throw new CluzterError("INVALID_INPUT");
  const parsed = dniResponse.safeParse(await cluzterGet(`/api/dni/${dni}`));
  if (!parsed.success || parsed.data.DNI !== dni) throw new CluzterError("INVALID_RESPONSE");
  const rawDate = parsed.data.FECHA_NAC?.trim();
  let birthDate: string | null = null;
  if (rawDate && /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
    const date = DateTime.fromFormat(rawDate, "dd/MM/yyyy", { zone: "UTC" });
    if (date.isValid && date.toFormat("dd/MM/yyyy") === rawDate) birthDate = date.toISODate();
  }
  return {
    dni,
    names: parsed.data.NOMBRES,
    paternalSurname: parsed.data.AP_PAT,
    maternalSurname: parsed.data.AP_MAT || null,
    birthDate,
    documentSexCode: ["1", "2"].includes(parsed.data.SEXO?.trim() || "")
      ? parsed.data.SEXO!.trim()
      : null,
  };
}
