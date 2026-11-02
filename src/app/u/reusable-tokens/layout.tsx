import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserSessionCookie } from '@/lib/auth';
import { canAccessReusableTokens } from '@/lib/reusable-tokens/access';

export default async function ReusableTokensLayout({ children }: { children: React.ReactNode }) {
  const raw = cookies().get('user_session')?.value;
  const session = await verifyUserSessionCookie(raw);

  if (!session) {
    redirect('/u/login?next=/u/reusable-tokens');
  }

  if (canAccessReusableTokens(session.role, session.area)) return <>{children}</>;

  redirect('/u');
}
