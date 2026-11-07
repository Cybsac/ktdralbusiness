import { z } from "zod";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster, rosterDaySchema } from "@/lib/roster/input";
const input = z
  .object({
    day: rosterDaySchema,
    personId: z.string().min(1).max(100),
    reason: z.string().trim().min(2).max(120),
  })
  .strict();
export async function POST(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json(
      { message: "Solo administración o coordinación puede registrar el motivo" },
      { status: 403 }
    );
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Revisa la jornada, persona y motivo" }, { status: 400 });
  const { day, personId, reason } = parsed.data;
  const [person, marks] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      select: { user: { select: { id: true } } },
    }),
    prisma.scan.count({ where: { personId, businessDay: day } }),
  ]);
  if (!person?.user)
    return Response.json(
      { message: "La persona debe estar registrada como colaborador" },
      { status: 400 }
    );
  if (!marks)
    return Response.json(
      { message: "Primero debe existir una marca de asistencia" },
      { status: 400 }
    );
  const context = await prisma.attendanceContext.upsert({
    where: { businessDay_personId: { businessDay: day, personId } },
    create: {
      businessDay: day,
      personId,
      reason,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    },
    update: { reason, updatedBy: actor.userId },
  });
  await audit("attendance.context.update", actor.userId, { day, personId, reason });
  return Response.json(
    { ok: true, reason: context.reason },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
