import { NextResponse } from "next/server";

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { inboxQuerySchema } from "@/lib/internal-news/contracts";
import { NewsError } from "@/lib/internal-news/core";
import { newsFailure } from "@/lib/internal-news/http";
import { assignedContent } from "@/lib/internal-news/revisions";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    const search = new URL(req.url).searchParams;
    const { page, limit } = inboxQuerySchema.parse({
      page: search.get("page") || undefined,
      limit: search.get("limit") || undefined,
    });
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip)) throw new NewsError("INVALID_PAGE", "Página inválida");
    const where = { userId: session.userId };
    const [rows, total, pendingCount] = await Promise.all([
      prisma.commitmentAssignment.findMany({
        where,
        include: { revision: true },
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.commitmentAssignment.count({ where }),
      prisma.commitmentAssignment.count({ where: { ...where, status: "PENDING" } }),
    ]);
    const items = rows.map((a) => {
      const content = assignedContent(a);
      const text = (content.regulationContent || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: a.id,
        title: content.name,
        status: a.status,
        mandatory: a.mandatory,
        includeTrivia: a.includeTrivia,
        revision: a.requiredVersion,
        assignedAt: a.assignedAt.toISOString(),
        completedAt: a.completedAt?.toISOString() || null,
        preview: text.length > 120 ? text.slice(0, 120) + "…" : text,
        content: content.regulationContent,
      };
    });
    return NextResponse.json(
      { ok: true, items, total, pendingCount, page, limit, hasMore: skip + items.length < total },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return newsFailure(error);
  }
}
