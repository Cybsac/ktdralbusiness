import { archiveNewsQuestion, saveNewsQuestion } from "@/lib/internal-news/content";
import { NewsError } from "@/lib/internal-news/core";
import { newsAdmin } from "@/lib/internal-news/http";
import { prisma } from "@/lib/prisma";
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => saveNewsQuestion(params.id, await req.json()), true);
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(
    req,
    "content",
    async () => ({ question: await archiveNewsQuestion(params.id) }),
    true
  );
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(
    req,
    "content",
    async () => {
      const question = await prisma.triviaQuestion.findUnique({
        where: { id: params.id, questionSet: { audience: "INTERNAL" } },
        include: { answers: { orderBy: { order: "asc" } }, _count: { select: { progress: true } } },
      });
      if (!question) throw new NewsError("NOT_FOUND", "Pregunta no encontrada", 404);
      return question;
    },
    true
  );
}
