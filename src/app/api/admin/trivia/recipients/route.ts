import { newsAdmin } from "@/lib/internal-news/http";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  return newsAdmin(
    req,
    "assignment",
    async () => {
      const users = await prisma.user.findMany({
        where: { person: { active: true } },
        select: { id: true, username: true, person: { select: { name: true, area: true } } },
        orderBy: { person: { name: "asc" } },
      });
      return {
        users: users.map((user) => ({
          id: user.id,
          username: user.username,
          personName: user.person.name,
          area: user.person.area,
        })),
      };
    },
    true
  );
}
