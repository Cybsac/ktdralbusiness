import { admissionActor } from "@/lib/admission/access";
import { currentBusinessDay } from "@/lib/attendanceDay";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const actor = await admissionActor(req);
  if (!actor || !["ADMIN", "COORDINATOR"].includes(actor.role))
    return Response.json({ message: "Sin acceso" }, { status: 403 });
  const day = currentBusinessDay();
  const [visits, checks, recent] = await Promise.all([
    prisma.admissionVisit.aggregate({
      where: { businessDay: day },
      _count: { _all: true },
      _sum: { entryCount: true },
    }),
    prisma.admissionCheck.groupBy({
      by: ["result"],
      where: { businessDay: day },
      _count: { _all: true },
    }),
    prisma.admissionMovement.findMany({
      where: { businessDay: day },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, actorId: true, createdAt: true },
    }),
  ]);
  const [inside, operators] = await Promise.all([
    prisma.admissionVisit.count({ where: { businessDay: day, inside: true } }),
    prisma.user.findMany({
      where: { id: { in: [...new Set(recent.map((r) => r.actorId))] } },
      select: { id: true, username: true, person: { select: { name: true } } },
    }),
  ]);
  const names = new Map(operators.map((user) => [user.id, user.person?.name || user.username]));
  return Response.json(
    {
      day,
      unique: visits._count._all,
      entries: visits._sum.entryCount || 0,
      inside,
      checks: Object.fromEntries(checks.map((c) => [c.result, c._count._all])),
      recent: recent.map(({ id, action, actorId, createdAt }) => ({
        id,
        action,
        operator: names.get(actorId) || "Usuario",
        createdAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
