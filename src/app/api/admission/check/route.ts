import { z } from "zod";

import { admissionActor } from "@/lib/admission/access";
import { admissionAge } from "@/lib/admission/age";
import { allowAdmissionCheck } from "@/lib/admission/limit";
import { createAdmissionProof, documentHash } from "@/lib/admission/proof";
import { currentBusinessDay } from "@/lib/attendanceDay";
import { CluzterError } from "@/lib/cluzter/config";
import { lookupDni } from "@/lib/cluzter/dni";
import { prisma } from "@/lib/prisma";
import { isValidDocumentNumber, normalizeDocumentNumber } from "@/lib/users/document";

export const dynamic = "force-dynamic";
const input = z
  .object({
    documentType: z.enum(["DNI", "CE", "OTHER"]),
    documentNumber: z.string().max(50),
    manualName: z.string().trim().min(3).max(160).optional(),
    manualBirthDate: z.string().optional(),
    physicalChecked: z.boolean().optional(),
  })
  .strict();
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request) {
  const actor = await admissionActor(req);
  if (!actor) return Response.json({ message: "Sin acceso a admisión" }, { status: 403, headers });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Revisa los datos del documento" }, { status: 400, headers });
  const data = parsed.data,
    number = normalizeDocumentNumber(data.documentNumber),
    day = currentBusinessDay();
  if (!isValidDocumentNumber(number, data.documentType))
    return Response.json({ message: "Número de documento inválido" }, { status: 400, headers });
  const source = data.documentType === "DNI" ? "CLUZTER" : "MANUAL";
  if (source === "MANUAL" && (!data.manualName || !data.manualBirthDate))
    return Response.json(
      { message: "Revisa el documento físico y completa nombre y fecha de nacimiento" },
      { status: 400, headers }
    );
  let name: string, birthDate: string | null;
  try {
    if (!(await allowAdmissionCheck(actor.userId)))
      return Response.json(
        { message: "Demasiadas consultas. Intenta más tarde." },
        { status: 429, headers }
      );
    if (source === "CLUZTER") {
      const person = await lookupDni(number);
      name = [person.names, person.paternalSurname, person.maternalSurname]
        .filter(Boolean)
        .join(" ");
      birthDate = person.birthDate;
    } else {
      name = data.manualName!;
      birthDate = data.manualBirthDate!;
    }
  } catch (error) {
    await prisma.admissionCheck.create({
      data: { businessDay: day, result: "UNKNOWN", source, actorId: actor.userId },
    });
    const notFound = error instanceof CluzterError && error.code === "NOT_FOUND";
    return Response.json(
      {
        result: "UNKNOWN",
        message: notFound
          ? "DNI no encontrado; no se pudo verificar la edad."
          : "No se pudo consultar el DNI. Revisa el documento y vuelve a intentarlo.",
      },
      { status: notFound ? 404 : 503, headers }
    );
  }
  const age = admissionAge(birthDate);
  const result = age === null ? "UNKNOWN" : age >= 18 ? "ADULT" : "MINOR";
  await prisma.admissionCheck.create({
    data: { businessDay: day, result, source, actorId: actor.userId },
  });
  if (result !== "ADULT") return Response.json({ result, name, age, source }, { headers });
  const hash = documentHash(data.documentType, number);
  const visit = await prisma.admissionVisit.findUnique({
    where: {
      businessDay_documentType_documentHash: {
        businessDay: day,
        documentType: data.documentType,
        documentHash: hash,
      },
    },
    select: { inside: true, entryCount: true },
  });
  const proof = createAdmissionProof({
    actor: actor.userId,
    day,
    type: data.documentType,
    hash,
    source,
  });
  return Response.json({ result, name, age, source, visit, proof }, { headers });
}
