import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import TeamPerformanceCard from '@/components/performance/TeamPerformanceCard';
import { verifyUserSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function TeamPerformancePage() {
  const session = await verifyUserSessionCookie(cookies().get('user_session')?.value);

  if (!session || !['ADMIN', 'COORDINATOR'].includes(session.role)) {
    redirect('/u');
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3 sm:mb-6">
          <a href="/u" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            ← Volver
          </a>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">Rendimiento del equipo</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Seguimiento de las calificaciones individuales registradas.</p>
          </div>
        </div>
        <TeamPerformanceCard />
      </div>
    </main>
  );
}
