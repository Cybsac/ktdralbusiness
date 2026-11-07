import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminLayout } from "@/components/AdminLayout";
import { verifyUserSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { BirthdayTemplateSettings } from "../BirthdayTemplateSettings";

export const dynamic = "force-dynamic";
export default async function BirthdayTemplatePage() {
  const session = await verifyUserSessionCookie(cookies().get("user_session")?.value);
  if (!session) redirect("/u/login");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, person: { select: { active: true } } },
  });
  if (!user || user.role !== "ADMIN" || !user.person.active) redirect("/u/birthdays");
  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <BirthdayTemplateSettings />
      </div>
    </AdminLayout>
  );
}
