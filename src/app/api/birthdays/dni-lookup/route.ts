import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { employeeDniLookup } from "@/lib/cluzter/employee-lookup";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await birthdayManager(req);
  if (!user || !["ADMIN", "COORDINATOR", "STAFF"].includes(user.role))
    return Response.json({ message: "Sin acceso" }, { status: 401 });
  return employeeDniLookup(req, user.userId, false, true);
}
