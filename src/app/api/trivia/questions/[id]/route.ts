import { archiveNewsQuestion, saveNewsQuestion } from "@/lib/internal-news/content";
import { newsAdmin } from "@/lib/internal-news/http";
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => ({
    question: await saveNewsQuestion(params.id, await req.json()),
  }));
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => ({
    question: await archiveNewsQuestion(params.id),
    message: "Pregunta archivada",
  }));
}
