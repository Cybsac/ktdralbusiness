export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError, apiOk } from '@/lib/apiError';

export async function GET(req: Request) {
  try {
    const session = await verifySessionCookie(getSessionCookieFromRequest(req));
    if (!session) return apiError('UNAUTHORIZED', 'UNAUTHORIZED', undefined, 401);
    if (!requireRole(session, ['ADMIN', 'COORDINATOR']).ok) return apiError('FORBIDDEN', 'FORBIDDEN', undefined, 403);

    const recent = await prisma.batch.findMany({
      where: { staticTargetUrl: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, description: true, createdAt: true, staticTargetUrl: true, _count: { select: { tokens: true } } },
    });
    const batches = recent;
    const ids = batches.map(batch => batch.id);
    const reserved = ids.length ? await prisma.$queryRaw<Array<{ batchId: string; count: bigint }>>`
      SELECT tFunc."batchId" AS "batchId", COUNT(DISTINCT tFunc.id) AS count
      FROM "Token" tRetry
      JOIN "Prize" pRetry ON pRetry.id = tRetry."prizeId"
      JOIN "Token" tFunc ON tFunc.id = tRetry."pairedNextTokenId"
      WHERE pRetry.key = 'retry' AND tFunc."batchId" IN (${Prisma.join(ids)})
      GROUP BY tFunc."batchId"
    ` : [];
    const reservedByBatch = new Map(reserved.map(row => [row.batchId, Number(row.count)]));
    return apiOk(batches.map(batch => ({
      id: batch.id,
      description: batch.description,
      createdAt: batch.createdAt,
      total: batch._count.tokens,
      printable: Math.max(0, batch._count.tokens - (reservedByBatch.get(batch.id) || 0)),
    })));
  } catch (error) {
    console.error('Error loading roulette print batches:', error);
    return apiError('INTERNAL_ERROR', 'Error al cargar los lotes', undefined, 500);
  }
}
