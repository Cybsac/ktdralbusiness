import { saveNewsQuestion } from "@/lib/internal-news/content";
import { newsAdmin } from "@/lib/internal-news/http";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  return newsAdmin(
    req,
    "content",
    () =>
      prisma.triviaQuestion.findMany({
        where: { questionSet: { audience: "INTERNAL" } },
        include: { answers: { orderBy: { order: "asc" } }, _count: { select: { progress: true } } },
        orderBy: { order: "asc" },
      }),
    true
  );
}
export async function POST(req: Request) {
  return newsAdmin(req, "content", async () => saveNewsQuestion(null, await req.json()), true);
}
