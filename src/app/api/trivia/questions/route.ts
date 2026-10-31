import { saveNewsQuestion } from "@/lib/internal-news/content";
import { newsAdmin } from "@/lib/internal-news/http";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  return newsAdmin(req, "content", async () => {
    const search = new URL(req.url).searchParams;
    const questions = await prisma.triviaQuestion.findMany({
      where: {
        questionSet: { audience: "INTERNAL" },
        ...(search.get("questionSetId") ? { questionSetId: search.get("questionSetId")! } : {}),
        ...(search.get("includeInactive") === "true" ? {} : { active: true }),
      },
      include: { answers: { orderBy: { order: "asc" } }, _count: { select: { progress: true } } },
      orderBy: { order: "asc" },
    });
    return {
      questions: questions.map((question) => ({
        ...question,
        answerCount: question.answers.length,
        correctAnswerCount: question.answers.filter((answer) => answer.isCorrect).length,
        attemptCount: question._count.progress,
      })),
    };
  });
}
export async function POST(req: Request) {
  return newsAdmin(req, "content", async () => ({
    question: await saveNewsQuestion(null, await req.json()),
  }));
}
