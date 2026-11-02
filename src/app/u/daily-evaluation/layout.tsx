import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserSessionCookie } from '@/lib/auth';
import { canViewDailyEvaluation } from '@/lib/daily-evaluation';

export default async function DailyEvaluationLayout({ children }: { children: React.ReactNode }) {
  const raw = cookies().get('user_session')?.value;
  const session = await verifyUserSessionCookie(raw);

  if (!session || !canViewDailyEvaluation(session.role)) {
    redirect('/u');
  }

  return <>{children}</>;
}
