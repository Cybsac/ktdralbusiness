import { z } from "zod";

import { currentBusinessDay } from "@/lib/attendanceDay";
import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster, rosterDaySchema } from "@/lib/roster/input";

export const dynamic = "force-dynamic";
const input = z
  .object({
    day: rosterDaySchema,
    personId: z.string().min(1).max(100),
    action: z.enum(["justify", "revoke"]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export async function GET(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json({ message: "Sin permiso" }, { status: 403 });
  const params = new URL(req.url).searchParams,
    day = rosterDaySchema.safeParse(params.get("day")),
    personId = params.get("personId") || "";
  if (!day.success || !personId || personId.length > 100)
    return Response.json({ message: "Datos inválidos" }, { status: 400 });
  const record = await prisma.attendanceJustification.findUnique({
    where: { businessDay_personId: { businessDay: day.data, personId } },
    select: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, reason: true, actorId: true, createdAt: true },
      },
    },
  });
  const events = record?.events || [];
  const actors = events.length
    ? await prisma.user.findMany({
        where: { id: { in: [...new Set(events.map((item) => item.actorId))] } },
        select: { id: true, username: true, person: { select: { name: true } } },
      })
    : [];
  const names = new Map(actors.map((user) => [user.id, user.person?.name || user.username]));
  return Response.json(
    {
      events: events.map(({ id, action, reason, actorId, createdAt }) => ({
        id,
        action,
        reason,
        actor: names.get(actorId) || "Usuario",
        createdAt,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
export async function POST(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !canEditRoster(actor.role))
    return Response.json(
      { message: "Solo administración o coordinación puede justificar" },
      { status: 403 }
    );
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ message: "Indica un comentario válido" }, { status: 400 });
  const { day, personId, action, reason } = parsed.data;
  if (day > currentBusinessDay())
    return Response.json({ message: "No se puede justificar una jornada futura" }, { status: 400 });
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`attendance-justification:${day}:${personId}`}, 0))::text`;
        const existing = await tx.attendanceJustification.findUnique({
          where: { businessDay_personId: { businessDay: day, personId } },
        });
        if (action === "revoke" && !existing?.active)
          return { error: "No hay una justificación activa" };
        const latest =
          action === "justify"
            ? await tx.scan.findFirst({
                where: { businessDay: day, personId },
                orderBy: [{ scannedAt: "desc" }, { id: "desc" }],
                select: { id: true, type: true },
              })
            : null;
        if (action === "justify" && (!latest || latest.type !== "IN"))
          return { error: "La última marca debe ser una entrada sin salida" };
        const entryScanId = latest?.id || existing!.entryScanId;
        if (
          action === "justify" &&
          existing?.active &&
          existing.entryScanId === entryScanId &&
          existing.reason === reason
        )
          return { ok: true, changed: false };
        const saved = await tx.attendanceJustification.upsert({
          where: { businessDay_personId: { businessDay: day, personId } },
          create: {
            businessDay: day,
            personId,
            entryScanId,
            reason,
            active: true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          update: {
            entryScanId,
            reason: action === "justify" ? reason : existing!.reason,
            active: action === "justify",
            updatedBy: actor.userId,
          },
        });
        await tx.attendanceJustificationEvent.create({
          data: {
            justificationId: saved.id,
            entryScanId,
            action: action === "justify" ? "JUSTIFIED" : "REVOKED",
            reason,
            actorId: actor.userId,
          },
        });
        return { ok: true, changed: true };
      },
      { isolationLevel: "Serializable" }
    );
    return Response.json(result, {
      status: result.error ? 409 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034")
      return Response.json(
        { message: "La jornada cambió. Actualiza y vuelve a intentar." },
        { status: 409 }
      );
    console.error("attendance justification failed", error);
    return Response.json({ message: "No se pudo guardar la justificación" }, { status: 500 });
  }
}
