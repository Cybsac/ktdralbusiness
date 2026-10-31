import { NextResponse } from "next/server";

import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { newsFailure } from "@/lib/internal-news/http";
import { assignedContent, publicNewsContent } from "@/lib/internal-news/revisions";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    if (!session) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    const search = new URL(req.url).searchParams;
    const id = search.get("assignmentId");
    const reread = search.get("view-regulation") === "1";
    const rows = await prisma.commitmentAssignment.findMany({
      where: {
        userId: session.userId,
        ...(id ? { id } : reread ? {} : { status: "PENDING", mandatory: true }),
      },
      include: { revision: true },
      orderBy: { assignedAt: reread ? "desc" : "asc" },
      ...(reread ? { take: 1 } : {}),
    });
    const assignments = rows.map(({ revision, ...row }) => ({
      ...row,
      questionSet: publicNewsContent(assignedContent({ revision })),
    }));
    return NextResponse.json(
      { ok: true, assignment: assignments[0] ?? null, assignments },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return newsFailure(error);
  }
}
