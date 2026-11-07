import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster, rosterDaySchema } from "@/lib/roster/input";

const input = z
  .object({
    day: rosterDaySchema,
    personId: z.string().min(1).max(100),
    roleId: z.string().min(1).max(100),
    active: z.boolean(),
  })
  .strict();
export async function POST(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json({ message: "Sin permiso para modificar asignaciones" }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Datos de asignación inválidos" }, { status: 400 });
  const { day, personId, roleId, active } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`roster-role:${roleId}`}, 0))::text`;
    const [role, person, existing] = await Promise.all([
      tx.rosterRole.findUnique({ where: { id: roleId }, select: { active: true, name: true } }),
      tx.person.findUnique({
        where: { id: personId },
        select: { active: true, name: true, user: { select: { id: true } } },
      }),
      tx.rosterAssignment.findUnique({
        where: { businessDay_personId_roleId: { businessDay: day, personId, roleId } },
      }),
    ]);
    if (!role || !person || (active && (!role.active || !person.active || !person.user)))
      return { error: "La función o el colaborador no está disponible." };
    if (existing?.active === active || (!existing && !active)) return { ok: true, changed: false };
    const saved = existing
      ? await tx.rosterAssignment.update({
          where: { id: existing.id },
          data: { active, updatedBy: actor.userId },
        })
      : await tx.rosterAssignment.create({
          data: {
            businessDay: day,
            personId,
            roleId,
            active,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
    await tx.rosterEvent.create({
      data: {
        businessDay: day,
        assignmentId: saved.id,
        personName: person.name,
        roleName: role.name,
        action: active ? "ASSIGNED" : "REMOVED",
        actorId: actor.userId,
      },
    });
    return { ok: true, changed: true };
  });
  return Response.json(result, {
    status: result.error ? 400 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
