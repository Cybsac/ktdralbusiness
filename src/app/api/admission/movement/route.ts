import { z } from "zod";

import { admissionActor } from "@/lib/admission/access";
import { readAdmissionProof } from "@/lib/admission/proof";
import { currentBusinessDay } from "@/lib/attendanceDay";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const input = z
  .object({
    proof: z.string().min(1).max(2048),
    action: z.enum(["ENTRY", "EXIT"]),
    physicalChecked: z.boolean().optional(),
  })
  .strict();
export async function POST(req: Request) {
  const actor = await admissionActor(req);
  if (!actor) return Response.json({ message: "Sin acceso a admisión" }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Datos de ingreso inválidos" }, { status: 400 });
  const day = currentBusinessDay();
  const proof = readAdmissionProof(parsed.data.proof, actor.userId, day);
  if (!proof)
    return Response.json(
      { message: "La verificación venció. Consulta nuevamente." },
      { status: 400 }
    );
  const key = { businessDay: day, documentType: proof.type, documentHash: proof.hash };
  const state = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${day}:${proof.type}:${proof.hash}`}, 0))::text`;
    const visit = await tx.admissionVisit.findUnique({
      where: { businessDay_documentType_documentHash: key },
    });
    const now = new Date();
    if (parsed.data.action === "ENTRY") {
      if (visit?.inside) return { ok: false, message: "Esta persona ya figura dentro." };
      const saved = !visit
        ? await tx.admissionVisit.create({
            data: {
              ...key,
              source: proof.source,
              createdBy: actor.userId,
              updatedBy: actor.userId,
              firstEntryAt: now,
              lastEntryAt: now,
            },
          })
        : await tx.admissionVisit.update({
            where: { id: visit.id },
            data: {
              inside: true,
              lastEntryAt: now,
              entryCount: { increment: 1 },
              updatedBy: actor.userId,
              source: proof.source,
            },
          });
      await tx.admissionMovement.create({
        data: {
          businessDay: day,
          visitId: saved.id,
          action: visit ? "REENTRY" : "ENTRY",
          actorId: actor.userId,
        },
      });
      return {
        ok: true,
        inside: true,
        message: visit ? "Reingreso registrado" : "Ingreso registrado",
      };
    }
    if (!visit?.inside)
      return { ok: false, message: "No hay un ingreso activo para registrar la salida." };
    await tx.admissionVisit.update({
      where: { id: visit.id },
      data: { inside: false, lastExitAt: now, updatedBy: actor.userId },
    });
    await tx.admissionMovement.create({
      data: { businessDay: day, visitId: visit.id, action: "EXIT", actorId: actor.userId },
    });
    return { ok: true, inside: false, message: "Salida registrada" };
  });
  return Response.json(state, {
    status: state.ok ? 200 : 409,
    headers: { "Cache-Control": "private, no-store" },
  });
}
