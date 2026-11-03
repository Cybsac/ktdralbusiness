import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserSessionCookie } from '@/lib/auth';
import { canManageDailyEvaluation } from '@/lib/daily-evaluation';
import JourneyUpdates from './JourneyUpdates';

export const dynamic = 'force-dynamic';
export default async function JourneyUpdatesPage() {
  const session = await verifyUserSessionCookie(cookies().get('user_session')?.value);
  if (!session || !canManageDailyEvaluation(session.role)) redirect('/u');
  return <JourneyUpdates />;
}
