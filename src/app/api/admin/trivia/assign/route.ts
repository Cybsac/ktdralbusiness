import { assignNews, listNewsAssignments } from "@/lib/internal-news/assignments";
import { newsAdmin } from "@/lib/internal-news/http";
export async function GET(req: Request) {
  return newsAdmin(
    req,
    "assignment",
    () => listNewsAssignments(new URL(req.url).searchParams),
    true
  );
}
export async function POST(req: Request) {
  return newsAdmin(req, "assignment", async () => assignNews(await req.json()), true);
}
