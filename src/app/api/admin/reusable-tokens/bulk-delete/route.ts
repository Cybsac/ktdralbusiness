import { purgeFilterSchema, purgeWhere, deletableWhere } from '@/lib/reusable-tokens/purge-query';
import { deleteUnusedReusableTokens } from "@/lib/reusable-tokens/deletion";
import { z } from "zod";
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

// POST /api/admin/reusable-tokens/bulk-delete
// body: { tokenIds: string[] }
export async function POST(req: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const input = await req.json();
    const schema = z.union([
      z.object({ tokenIds: z.array(z.string().min(1)).min(1).max(REUSABLE_POLICY.maxBulkTokens) }),
      z.object({ filter: purgeFilterSchema, cursor: z.string().min(1).optional() }),
    ]);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return apiError('INVALID_INPUT', 'Selección inválida', undefined, 400);
    if ('tokenIds' in parsed.data) {
      const { deleted, skipped } = await deleteUnusedReusableTokens(parsed.data.tokenIds);
      return NextResponse.json({ success: true, deleted, skipped, message: `${deleted} token(es) eliminado(s)${skipped ? `, ${skipped} omitido(s) por uso, historial o cambios` : ''}` });
    }
    const { filter, cursor } = parsed.data;
    if (new Date(filter.asOf).getTime() > Date.now() + REUSABLE_POLICY.purgeClockSkewMs) return apiError('INVALID_INPUT', 'Fecha de selección inválida', undefined, 400);
    const tokens = await prisma.reusableToken.findMany({
      where: { AND: [purgeWhere(filter), deletableWhere, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
      select: { id: true }, orderBy: { id: 'asc' }, take: REUSABLE_POLICY.maxBulkTokens,
    });
    const { deleted, skipped } = await deleteUnusedReusableTokens(tokens.map(token => token.id));
    return NextResponse.json({ success: true, deleted, skipped, nextCursor: tokens.length === REUSABLE_POLICY.maxBulkTokens ? tokens[tokens.length - 1].id : null });
  } catch (error) {
    console.error("Error bulk deleting reusable tokens:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}
