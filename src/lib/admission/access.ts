import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function admissionActor(req: Request) {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, person: { select: { active: true, area: true } } },
  });
  if (!user?.person?.active) return null;
  if (
    !["ADMIN", "COORDINATOR", "STAFF"].includes(user.role) &&
    !(user.role === "COLLAB" && user.person.area === "Seguridad")
  )
    return null;
  return { userId: user.id, role: user.role };
}
