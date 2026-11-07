import { z } from "zod";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster, rosterRoleKey, rosterRoleNameSchema } from "@/lib/roster/input";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: rosterRoleNameSchema }).strict(),
  z
    .object({
      action: z.literal("update"),
      id: z.string().min(1),
      name: rosterRoleNameSchema,
      active: z.boolean(),
    })
    .strict(),
]);
export async function POST(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json({ message: "Sin permiso para gestionar funciones" }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Nombre de función inválido" }, { status: 400 });
  const data = parsed.data;
  try {
    const role = await prisma.$transaction(async (tx) => {
      if (data.action === "update") {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`roster-role:${data.id}`}, 0))::text`;
        return tx.rosterRole.update({
          where: { id: data.id },
          data: { name: data.name, nameKey: rosterRoleKey(data.name), active: data.active },
        });
      }
      return tx.rosterRole.create({ data: { name: data.name, nameKey: rosterRoleKey(data.name) } });
    });
    await audit("roster.role.change", actor.userId, {
      roleId: role.id,
      name: role.name,
      active: role.active,
    });
    return Response.json({ ok: true, role });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return Response.json({ message: "Ya existe una función con ese nombre." }, { status: 409 });
    if ((error as { code?: string }).code === "P2025")
      return Response.json({ message: "Función no encontrada." }, { status: 404 });
    return Response.json({ message: "No se pudo guardar la función." }, { status: 500 });
  }
}
