import { createNewsSet } from "@/lib/internal-news/content";
import { newsAdmin } from "@/lib/internal-news/http";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return newsAdmin(req, "content", async () => {
    const sets = await prisma.triviaQuestionSet.findMany({
      where:
        new URL(req.url).searchParams.get("includeInactive") === "true"
          ? { audience: "INTERNAL" }
          : { active: true, audience: "INTERNAL" },
      include: { _count: { select: { questions: true, commitmentAssignments: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      questionSets: sets.map((set) => ({
        ...set,
        questionCount: set._count.questions,
        assignmentCount: set._count.commitmentAssignments,
      })),
    };
  });
}
export async function POST(req: Request) {
  return newsAdmin(req, "content", async () => ({
    questionSet: await createNewsSet(await req.json()),
  }));
}
