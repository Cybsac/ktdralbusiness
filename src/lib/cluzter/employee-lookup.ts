import { NextResponse } from "next/server";
import { z } from "zod";

import { signBirthdayIdentity } from "@/lib/birthdays/identity-proof";
import { verifyPublicChallenge } from "@/lib/security/turnstile";

import { CluzterError } from "./config";
import { lookupDni } from "./dni";
import { allowEmployeeLookup } from "./limit";

const input = z
  .object({
    dni: z.string().regex(/^\d{8}$/),
    documentType: z.literal("DNI"),
    challengeToken: z.string().max(2048).optional(),
  })
  .strict();
export async function employeeDniLookup(req: Request, subject: string, isPublic = false, birthdayProof = false) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida" }, { status: 400 });
  }
  const parsed = input.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ message: "Ingresa un DNI de 8 dígitos" }, { status: 400 });
  try {
    if (isPublic && !(await allowEmployeeLookup("global", "global")))
      return NextResponse.json(
        { message: "Demasiadas consultas. Intenta más tarde." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    if (!(await allowEmployeeLookup(subject, isPublic ? "public" : "staff")))
      return NextResponse.json(
        { message: "Demasiadas consultas. Intenta más tarde." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    if (isPublic && !(await verifyPublicChallenge(parsed.data.challengeToken)))
      return NextResponse.json(
        { message: "Completa la verificación para consultar el DNI." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    const person = await lookupDni(parsed.data.dni);
    const name = [person.names, person.paternalSurname, person.maternalSurname]
      .filter(Boolean)
      .join(" ");
    return NextResponse.json(
      {
        name,
        displayName: [person.names.split(/\s+/)[0], person.paternalSurname].join(" "),
        birthday: person.birthDate,
        documentSexCode: person.documentSexCode,
        ...((isPublic || birthdayProof) && person.birthDate
          ? {
              birthdayIdentityProof: signBirthdayIdentity({
                documento: parsed.data.dni,
                name,
                birthDate: person.birthDate,
              }),
            }
          : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof CluzterError) {
      const messages: Record<string, [number, string]> = {
        NOT_FOUND: [404, "DNI no encontrado"],
        INVALID_INPUT: [400, "DNI inválido"],
        AUTH: [503, "La consulta de DNI no está disponible"],
        NOT_CONFIGURED: [503, "La consulta de DNI no está configurada"],
        QUOTA: [503, "No hay consultas disponibles"],
        RATE_LIMITED: [429, "Se alcanzó el límite de consultas"],
        INVALID_RESPONSE: [502, "La respuesta del proveedor no pudo validarse"],
        UNAVAILABLE: [503, "La consulta de DNI no está disponible"],
      };
      const [status, message] = messages[error.code];
      return NextResponse.json(
        { code: error.code, message },
        { status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { message: "La consulta de DNI no está disponible" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
