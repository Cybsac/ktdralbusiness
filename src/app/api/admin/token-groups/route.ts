import { chooseGroupColor } from "@/lib/reusable-tokens/group-color";
import {reusableGroupTokenSelect} from "@/lib/reusable-tokens/select";
import { getPublicBaseUrl } from "@/lib/config";
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
    }

    if (new URL(req.url).searchParams.get("summary") === "1") {
      const groups = await prisma.tokenGroup.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          locked: true,
          sortOrder: true,
          createdAt: true,
          _count: { select: { tokens: true } },
        },
      });
      const totals = await prisma.reusableToken.groupBy({
        by: ["groupId"],
        where: { groupId: { in: groups.map((group) => group.id) } },
        _sum: { usedCount: true, maxUses: true },
      });
      const byGroup = new Map(totals.map((row) => [row.groupId, row._sum]));
      return NextResponse.json(
        groups.map((group) => ({
          ...group,
          tokens: [],
          totalUsed: byGroup.get(group.id)?.usedCount || 0,
          totalMax: byGroup.get(group.id)?.maxUses || 0,
        })),
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const groups = await prisma.tokenGroup.findMany({
      include: {
        tokens: {
          select: reusableGroupTokenSelect,
        },
        _count: {
          select: { tokens: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const qrBaseUrl = getPublicBaseUrl(req.url);
    const groupsWithQrUrls = groups.map((group) => ({
      ...group,
      tokens: group.tokens.map((token) => ({
        ...token,
        qrUrl: `${qrBaseUrl.replace(/\/$/, "")}/reusable/${token.id}`,
      })),
    }));

    return NextResponse.json(groupsWithQrUrls);
  } catch (error) {
    console.error("[token-groups] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(request);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Auto-assign sortOrder to end of list
    const [maxOrder, existingGroups] = await Promise.all([
      prisma.tokenGroup.aggregate({ _max: { sortOrder: true } }),
      prisma.tokenGroup.findMany({ select: { color: true } }),
    ]);
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const group = await prisma.tokenGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: chooseGroupColor(existingGroups.map((group) => group.color)),
        sortOrder: nextOrder,
      },
    });

    return NextResponse.json(group);
  } catch (error) {
    console.error("Error creating token group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Reorder groups — expects { order: string[] } (array of group IDs in desired order)
export async function PUT(request: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(request);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
    }

    const { order } = await request.json();
    if (!Array.isArray(order)) {
      return NextResponse.json({ error: "order must be an array of group IDs" }, { status: 400 });
    }

    await prisma.$transaction(
      order.map((id: string, idx: number) =>
        prisma.tokenGroup.update({ where: { id }, data: { sortOrder: idx } })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering groups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
