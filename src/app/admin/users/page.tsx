import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserActor } from "@/lib/users/access";
import { UsersClient } from "./UsersClient";
import UsersWithTabsClient from "./UsersWithTabsClient";
export default async function AdminUsersPage() {
  let actor;
  try {
    actor = await requireUserActor({ headers: headers() } as Request);
  } catch {
    redirect("/u/login?next=/admin/users");
  }
  if (actor.role === "STAFF")
    return (
      <div className="mx-auto p-6 max-w-[1600px]">
        <UsersClient role={actor.role} />
      </div>
    );
  return <UsersWithTabsClient actor={{ userId: actor.userId, role: actor.role }} />;
}
