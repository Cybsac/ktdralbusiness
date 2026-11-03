import StationClient from '@/app/u/estacion/StationClient';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminStationPage() {
  const session = await verifyUserSessionCookie(cookies().get('user_session')?.value);
  if (!session) redirect('/u/login');
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, person: { select: { active: true } } } });
  if (!user?.person?.active || user.role !== 'ADMIN') redirect('/u/estacion/terminal');
  return <StationClient backHref="/admin" />;
}
