import { PRINT_CONTROL_POLICY, type PrintBatchKind } from "@/lib/print/control-policy";

import { Prisma } from "@prisma/client";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/apiError";

export async function readPrintBatches(req: Request, fixedKind?: PrintBatchKind) {
  try {
    const session = await verifySessionCookie(getSessionCookieFromRequest(req));
    if (!session) return apiError("UNAUTHORIZED", "UNAUTHORIZED", undefined, 401);
    if (!requireRole(session, ["ADMIN", "COORDINATOR"]).ok)
      return apiError("FORBIDDEN", "FORBIDDEN", undefined, 403);

    const url = new URL(req.url);
    const kind = fixedKind ?? url.searchParams.get("kind");
    if (kind !== "static" && kind !== "roulette")
      return apiError("INVALID_KIND", "Tipo de lote inválido", undefined, 400);
    const where =
      kind === "static" ? { staticTargetUrl: { not: null } } : { staticTargetUrl: null };
    const select = {
      id: true,
      description: true,
      createdAt: true,
      _count: { select: { tokens: true } },
    } as const;
    const recent = await prisma.batch.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PRINT_CONTROL_POLICY.recentBatches,
      select,
    });
    const preselect = url.searchParams.get("preselect");
    const selected =
      preselect && !recent.some((batch) => batch.id === preselect)
        ? await prisma.batch.findFirst({ where: { ...where, id: preselect }, select })
        : null;
    const batches = selected ? [selected, ...recent] : recent;
    const ids = batches.map((batch) => batch.id);
    const reserved = ids.length
      ? await prisma.$queryRaw<Array<{ batchId: string; count: bigint }>>`
      SELECT tFunc."batchId" AS "batchId", COUNT(DISTINCT tFunc.id) AS count
      FROM "Token" tRetry
      JOIN "Prize" pRetry ON pRetry.id = tRetry."prizeId"
      JOIN "Token" tFunc ON tFunc.id = tRetry."pairedNextTokenId"
      WHERE pRetry.key = 'retry' AND tFunc."batchId" IN (${Prisma.join(ids)})
      GROUP BY tFunc."batchId"
    `
      : [];
    const reservedByBatch = new Map(reserved.map((row) => [row.batchId, Number(row.count)]));
    return apiOk(
      batches.map((batch) => ({
        id: batch.id,
        description: batch.description,
        createdAt: batch.createdAt,
        total: batch._count.tokens,
        printable: Math.max(0, batch._count.tokens - (reservedByBatch.get(batch.id) || 0)),
      })),
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch (error) {
    console.error("Error loading print batches:", error);
    return apiError("INTERNAL_ERROR", "Error al cargar los lotes", undefined, 500);
  }
}
