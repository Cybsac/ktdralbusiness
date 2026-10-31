import { inboxQuerySchema } from "@/lib/internal-news/contracts";
import { NewsError } from "@/lib/internal-news/core";
import { newsAdmin } from "@/lib/internal-news/http";
import { captureNews } from "@/lib/internal-news/revisions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => {
    const search = new URL(req.url).searchParams;
    const { page, limit } = inboxQuerySchema.parse({
      page: search.get("page") || undefined,
      limit: search.get("limit") || undefined,
    });
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip)) throw new NewsError("INVALID_PAGE", "Página inválida");
    if (
      !(await prisma.triviaQuestionSet.findUnique({
        where: { id: params.id, audience: "INTERNAL" },
        select: { id: true },
      }))
    )
      throw new NewsError("NOT_FOUND", "Comunicado no encontrado", 404);
    const where = { questionSetId: params.id };
    const [rows, total] = await Promise.all([
      prisma.internalNewsRevision.findMany({
        where,
        orderBy: { version: "desc" },
        skip,
        take: limit,
        include: { _count: { select: { assignments: true } } },
      }),
      prisma.internalNewsRevision.count({ where }),
    ]);
    return {
      revisions: rows.map((row) => ({
        id: row.id,
        version: row.version,
        createdAt: row.createdAt,
        assignmentCount: row._count.assignments,
        snapshot: captureNews(row.snapshot),
      })),
      page,
      total,
      hasMore: skip + rows.length < total,
    };
  });
}
