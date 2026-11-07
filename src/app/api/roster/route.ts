import { attendanceRow } from "@/lib/attendance/report";
import { currentBusinessDay } from "@/lib/attendanceDay";
import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster, rosterDaySchema } from "@/lib/roster/input";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor) return Response.json({ message: "Sin acceso" }, { status: 401 });
  const parsed = rosterDaySchema.safeParse(
    new URL(req.url).searchParams.get("day") || currentBusinessDay()
  );
  if (!parsed.success) return Response.json({ message: "Jornada inválida" }, { status: 400 });
  const day = parsed.data,
    canEdit = canEditRoster(actor.role);
  const includeHistory = canEdit && new URL(req.url).searchParams.get("history") !== "0";
  const [roles, assignments, events] = await Promise.all([
    prisma.rosterRole.findMany({
      where: canEdit
        ? {}
        : { OR: [{ active: true }, { assignments: { some: { businessDay: day, active: true } } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.rosterAssignment.findMany({
      where: { businessDay: day, active: true },
      orderBy: { person: { name: "asc" } },
      select: {
        id: true,
        roleId: true,
        personId: true,
        person: { select: { name: true, area: true, jobTitle: true, active: true } },
      },
    }),
    includeHistory
      ? prisma.rosterEvent.findMany({
          where: { businessDay: day },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            action: true,
            actorId: true,
            createdAt: true,
            personName: true,
            roleName: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const actors =
    includeHistory && events.length
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(events.map((event) => event.actorId))] } },
          select: { id: true, username: true, person: { select: { name: true } } },
        })
      : [];
  const names = new Map(actors.map((user) => [user.id, user.person?.name || user.username]));
  const [marks, evaluation, justifications] =
    canEdit && assignments.length
      ? await Promise.all([
          prisma.scan.findMany({
            where: {
              businessDay: day,
              personId: { in: [...new Set(assignments.map((item) => item.personId))] },
            },
            orderBy: [{ scannedAt: "asc" }, { id: "asc" }],
            select: { id: true, personId: true, type: true, scannedAt: true },
          }),
          prisma.dailyEvaluation.findUnique({
            where: { businessDay: day },
            select: { closedAt: true },
          }),
          prisma.attendanceJustification.findMany({
            where: {
              businessDay: day,
              active: true,
              personId: { in: [...new Set(assignments.map((item) => item.personId))] },
            },
            select: { personId: true, entryScanId: true, reason: true },
          }),
        ])
      : [[], null, []];
  const justificationByPerson = new Map(justifications.map((item) => [item.personId, item]));
  const byPerson = new Map<string, typeof marks>();
  for (const mark of marks) {
    const group = byPerson.get(mark.personId) || [];
    group.push(mark);
    byPerson.set(mark.personId, group);
  }
  const withAttendance = assignments.map((item) => {
    if (!canEdit) return item;
    const group = byPerson.get(item.personId) || [],
      entries = group.filter((mark) => mark.type === "IN"),
      exits = group.filter((mark) => mark.type === "OUT");
    const row = attendanceRow({
      personId: item.personId,
      userId: null,
      personCode: "",
      personName: item.person.name,
      area: item.person.area,
      day,
      firstIn: entries[0]?.scannedAt || null,
      lastIn: entries.at(-1)?.scannedAt || null,
      lastOut: exits.at(-1)?.scannedAt || null,
      lastType: group.at(-1)?.type || null,
      roles: ["programado"],
      contextReason: null,
      closedAt: evaluation?.closedAt || null,
      justificationReason:
        group.at(-1)?.type === "IN" &&
        justificationByPerson.get(item.personId)?.entryScanId === entries.at(-1)?.id
          ? justificationByPerson.get(item.personId)?.reason
          : null,
      doneCount: 0,
      totalCount: 0,
    });
    return {
      ...item,
      attendance: {
        state: row.attendanceState,
        firstIn: row.firstIn,
        lastOut: row.lastOut,
        justified: !!row.justification,
      },
    };
  });
  return Response.json(
    {
      day,
      currentDay: currentBusinessDay(),
      canEdit,
      roles,
      assignments: withAttendance,
      history: events.map((event) => ({
        id: event.id,
        action: event.action,
        actor: names.get(event.actorId) || "Usuario",
        person: event.personName,
        role: event.roleName,
        createdAt: event.createdAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
