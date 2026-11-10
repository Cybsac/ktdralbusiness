import { z } from 'zod';
import { purgeWhere, deletableWhere } from '@/lib/reusable-tokens/purge-query';
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { getPublicBaseUrl } from "@/lib/config";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const query = req.nextUrl.searchParams;
    const parsed = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(REUSABLE_POLICY.maxPageSize).default(REUSABLE_POLICY.pageSize),
      search: z.string().trim().max(200).default(''),
      usage: z.enum(['all', 'unused', 'used']).default('all'),
      asOf: z.string().datetime().optional(),
    }).safeParse(Object.fromEntries(query));
    if (!parsed.success) return apiError('INVALID_INPUT', 'Filtros inválidos', undefined, 400);
    const { page, limit, search, usage } = parsed.data;
    const asOf = parsed.data.asOf || new Date().toISOString();
    if (new Date(asOf).getTime() > Date.now() + REUSABLE_POLICY.purgeClockSkewMs) return apiError('INVALID_INPUT', 'Fecha de selección inválida', undefined, 400);
    const where = purgeWhere({ search, usage, asOf });
    const [tokens, total, eligible] = await Promise.all([
      prisma.reusableToken.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
        include: { prize: { select: { id: true, label: true, key: true, color: true } }, _count: { select: { redemptions: true } } },
      }),
      prisma.reusableToken.count({ where }),
      prisma.reusableToken.count({ where: { AND: [where, deletableWhere] } }),
    ]);

    const formattedTokens = tokens.map((token) => ({
      id: token.id,
      qrUrl: `${getPublicBaseUrl(req.url)}/reusable/${token.id}`,
      prize: {
        id: token.prize.id,
        label: token.prize.label,
        key: token.prize.key,
        color: token.prize.color,
      },
      maxUses: token.maxUses,
      usedCount: token.usedCount,
      expiresAt: token.expiresAt,
      validFrom: token.validFrom,
      startTime: token.startTime,
      endTime: token.endTime,
      createdAt: token.createdAt,
      deliveryNote: token.deliveryNote,
      disabled: token.disabled,
      deletable: token.usedCount === 0 && token._count.redemptions === 0,
    }));

    return NextResponse.json({ tokens: formattedTokens, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, eligible, asOf }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error fetching all reusable tokens:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}
