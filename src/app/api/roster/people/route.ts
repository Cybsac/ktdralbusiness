import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster } from "@/lib/roster/input";
export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;
export async function GET(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json({ message: "Sin permiso" }, { status: 403 });
  const params = new URL(req.url).searchParams,
    roleId = params.get("roleId") || "",
    query = (params.get("q") || "").trim();
  if (!roleId || roleId.length > 100 || query.length > 100)
    return Response.json({ message: "Búsqueda inválida" }, { status: 400 });
  const role = await prisma.rosterRole.findUnique({
    where: { id: roleId },
    select: { name: true, active: true },
  });
  if (!role?.active) return Response.json({ message: "Función no disponible" }, { status: 404 });
  const base: Prisma.PersonWhereInput = {
    active: true,
    user: { isNot: null },
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { area: { contains: query, mode: "insensitive" } },
            { jobTitle: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const select = { id: true, name: true, area: true, jobTitle: true } as const;
  const primary = await prisma.person.findMany({
    where: { AND: [base, { area: { equals: role.name, mode: "insensitive" } }] },
    orderBy: { name: "asc" },
    select,
    take: PAGE_SIZE,
  });
  const rest =
    primary.length < PAGE_SIZE
      ? await prisma.person.findMany({
          where: {
            AND: [
              base,
              {
                OR: [{ area: null }, { NOT: { area: { equals: role.name, mode: "insensitive" } } }],
              },
            ],
          },
          orderBy: { name: "asc" },
          select,
          take: PAGE_SIZE - primary.length,
        })
      : [];
  return Response.json(
    { people: [...primary, ...rest], limited: primary.length + rest.length === PAGE_SIZE },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
