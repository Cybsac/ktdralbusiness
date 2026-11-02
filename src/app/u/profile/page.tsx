import { cookies } from 'next/headers';
import { verifyUserSessionCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ProfileClient from '@/app/u/profile/ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const raw = cookies().get('user_session')?.value;
  const session = await verifyUserSessionCookie(raw);
  if (!session) {
    redirect('/u/login?next=%2Fu%2Fprofile');
  }

  return <ProfileClient />;
}
