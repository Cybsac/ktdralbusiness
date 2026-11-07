import { employeeDniLookup } from "@/lib/cluzter/employee-lookup";
import { requireUserActor } from "@/lib/users/access";
import { userFailure } from "@/lib/users/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const actor = await requireUserActor(req, "write");
    return employeeDniLookup(req, actor.userId);
  } catch (error) {
    return userFailure(error);
  }
}
