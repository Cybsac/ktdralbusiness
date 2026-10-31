import { cancelNewsAssignment } from "@/lib/internal-news/assignments";
import { newsAdmin } from "@/lib/internal-news/http";
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return newsAdmin(req, "assignment", () => cancelNewsAssignment(params.id), true);
}
