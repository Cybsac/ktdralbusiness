import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), threshold: z.number().int().positive().max(2147483647), points: z.number().int().nonnegative().max(2147483647) }).strict(),
  z.object({ action: z.literal('toggle'), id: z.string().min(1), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('points'), id: z.string().min(1), points: z.number().int().nonnegative().max(2147483647) }).strict(),
]);
async function administrator(request: NextRequest) {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(request));
  return session?.role === 'ADMIN' ? session : null;
}
export async function GET(request: NextRequest) {
  if (!await administrator(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const rules = await prisma.$queryRaw`SELECT m."id", m."threshold", m."points", m."enabled", COUNT(a."userId")::int AS "awardsCount" FROM "ActivityMilestone" m LEFT JOIN "ActivityMilestoneAward" a ON a."milestoneId" = m."id" GROUP BY m."id" ORDER BY m."threshold"`;
    return NextResponse.json({ rules }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error loading milestone settings:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los hitos.' }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  const session = await administrator(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos de hito inválidos.' }, { status: 400 });
  try {
    const data = parsed.data;
    const changed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('activity-milestone-policy', 0))::text`;
      const ruleId = data.action === 'create' ? randomUUID() : data.id;
      if (data.action === 'create') {
        await tx.$executeRaw`INSERT INTO "ActivityMilestone" ("id", "threshold", "points") VALUES (${ruleId}, ${data.threshold}, ${data.points})`;
      } else if (data.action === 'toggle') {
        const count = await tx.$executeRaw`UPDATE "ActivityMilestone" SET "enabled" = ${data.enabled} WHERE "id" = ${data.id}`;
        if (!count) return false;
      } else {
        const count = await tx.$executeRaw`UPDATE "ActivityMilestone" SET "points" = ${data.points} WHERE "id" = ${data.id}`;
        if (!count) return false;
      }
      // Grant newly enabled milestones to everyone who already qualifies; prior awards retain their original points.
      await tx.$executeRaw`INSERT INTO "ActivityMilestoneAward" ("userId", "milestoneId", "threshold", "points", "earnedAt") SELECT b."userId", m."id", m."threshold", m."points", CURRENT_TIMESTAMP FROM "ActivityBalance" b CROSS JOIN "ActivityMilestone" m WHERE m."enabled" AND m."id" = ${ruleId} AND b."total" >= m."threshold" ON CONFLICT ("userId", "milestoneId") DO NOTHING`;
      return true;
    });
    if (!changed) return NextResponse.json({ error: 'Hito no encontrado.' }, { status: 404 });
    await logEvent('ACTIVITY_MILESTONE_POLICY_CHANGED', 'Configuración de hitos actualizada', { actorUserId: session.userId, ...data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2002' || (error.code === 'P2010' && 'meta' in error && typeof error.meta === 'object' && error.meta !== null && 'code' in error.meta && error.meta.code === '23505'))) return NextResponse.json({ error: 'Ya existe un hito con esa cantidad de operaciones.' }, { status: 409 });
    console.error('Error saving milestone settings:', error);
    return NextResponse.json({ error: 'No se pudo guardar el hito.' }, { status: 500 });
  }
}
