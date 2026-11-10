import { z } from "zod";
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

    const { searchParams } = new URL(req.url);
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1),
        limit: z.coerce.number().int().min(1).max(REUSABLE_POLICY.maxPageSize),
        usage: z.enum(["all", "unused"]).default("all"),
        search: z.string().trim().max(200).default(""),
        sort: z.enum(["activity", "newest", "oldest", "most_used", "least_used"]).default("activity"),
      })
      .safeParse({
        page: searchParams.get("page") || 1,
        limit: searchParams.get("limit") || REUSABLE_POLICY.pageSize,
        usage: searchParams.get("usage") || "all",
        search: searchParams.get("search") || "",
        sort: searchParams.get("sort") || "activity",
      });
    if (!parsed.success)
      return apiError("INVALID_PAGINATION", "Paginación inválida", undefined, 400);
    const { page, limit, usage, search, sort } = parsed.data;
    const unusedOnly = usage === "unused";
    const offset = (page - 1) * limit;

    // Ordenar por última actividad visible (canje/entrega) y luego por creación.
    const [tokens, totalCount] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          id: string;
          prizeId: string;
          groupId: string | null;
          expiresAt: Date;
          validFrom: Date | null;
          weekdays: number[];
          createdAt: Date;
          redeemedAt: Date | null;
          deliveredAt: Date | null;
          deliveryNote: string | null;
          maxUses: number;
          usedCount: number;
          startTime: Date | null;
          endTime: Date | null;
          disabled: boolean;
        }>
      >`
        SELECT rt.*
        FROM "ReusableToken" rt
        WHERE (${unusedOnly} = false OR rt."usedCount" = 0)
          AND (${search} = '' OR position(lower(${search}) in lower(rt.id)) > 0
            OR EXISTS (SELECT 1 FROM "ReusablePrize" p WHERE p.id = rt."prizeId" AND (position(lower(${search}) in lower(p.label)) > 0 OR position(lower(${search}) in lower(p.key)) > 0))
            OR EXISTS (SELECT 1 FROM "TokenGroup" g WHERE g.id = rt."groupId" AND position(lower(${search}) in lower(g.name)) > 0))
        ORDER BY
        CASE WHEN ${sort} = 'activity' THEN GREATEST(COALESCE(rt."redeemedAt", rt."createdAt"), COALESCE(rt."deliveredAt", rt."createdAt"), rt."createdAt") END DESC,
        CASE WHEN ${sort} = 'oldest' THEN rt."createdAt" END ASC,
        CASE WHEN ${sort} = 'newest' THEN rt."createdAt" END DESC,
        CASE WHEN ${sort} = 'most_used' THEN rt."usedCount" END DESC,
        CASE WHEN ${sort} = 'least_used' THEN rt."usedCount" END ASC,
        rt."createdAt" DESC, rt.id DESC
        OFFSET ${offset}
        LIMIT ${limit}
      `,
      prisma.reusableToken.count({ where: {
        ...(unusedOnly ? { usedCount: 0 } : {}),
        ...(search ? { OR: [
          { id: { contains: search, mode: "insensitive" } },
          { prize: { label: { contains: search, mode: "insensitive" } } },
          { prize: { key: { contains: search, mode: "insensitive" } } },
          { group: { is: { name: { contains: search, mode: "insensitive" } } } },
        ] } : {}),
      } }),
    ]);

    const prizeIds = Array.from(new Set(tokens.map((token) => token.prizeId)));
    const groupIds = Array.from(
      new Set(
        tokens.map((token) => token.groupId).filter((groupId): groupId is string => !!groupId)
      )
    );

    const [prizes, groups] = await Promise.all([
      prisma.reusablePrize.findMany({
        where: { id: { in: prizeIds } },
        select: {
          id: true,
          label: true,
          key: true,
          color: true,
        },
      }),
      prisma.tokenGroup.findMany({
        where: { id: { in: groupIds } },
        select: {
          id: true,
          name: true,
          color: true,
        },
      }),
    ]);

    const prizeById = new Map(prizes.map((prize) => [prize.id, prize]));
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const formattedTokens = tokens.map((token) => ({
      id: token.id,
      qrUrl: `${getPublicBaseUrl(req.url)}/reusable/${token.id}`,
      prize: {
        id: prizeById.get(token.prizeId)?.id || token.prizeId,
        label: prizeById.get(token.prizeId)?.label || "Premio desconocido",
        key: prizeById.get(token.prizeId)?.key || "",
        color: prizeById.get(token.prizeId)?.color || null,
      },
      group: token.groupId
        ? {
            id: token.groupId,
            name: groupById.get(token.groupId)?.name || "Grupo desconocido",
            color: groupById.get(token.groupId)?.color || null,
          }
        : null,
      maxUses: token.maxUses,
      usedCount: token.usedCount,
      expiresAt: token.expiresAt,
      validFrom: token.validFrom,
      weekdays: token.weekdays,
      startTime: token.startTime,
      endTime: token.endTime,
      createdAt: token.createdAt,
      deliveryNote: token.deliveryNote,
      redeemedAt: token.redeemedAt,
      deliveredAt: token.deliveredAt,
    }));

    return NextResponse.json(
      {
        tokens: formattedTokens,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Error fetching recent tokens:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
