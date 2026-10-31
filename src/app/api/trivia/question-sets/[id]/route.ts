import { archiveNewsSet, updateNewsSet } from "@/lib/internal-news/content";
import { newsAdmin } from "@/lib/internal-news/http";
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => ({
    questionSet: await updateNewsSet(params.id, await req.json()),
  }));
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "content", async () => ({
    questionSet: await archiveNewsSet(params.id),
    message: "Comunicado archivado; historial conservado",
  }));
}
