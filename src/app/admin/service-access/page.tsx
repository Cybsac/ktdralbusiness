import ServiceAccessPanel from './ServiceAccessPanel';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserSessionCookie } from '@/lib/auth';

export const metadata = {
  title: 'Acceso de la aplicación',
};

export default async function ServiceAccessPage() {
  const session = await verifyUserSessionCookie(cookies().get('user_session')?.value);
  if (session?.role !== 'ADMIN') redirect('/admin');

  return (
    <div className="min-h-full bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Control del servicio</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Acceso de la aplicación</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Suspende o reactiva el acceso público y configura el mensaje que verá el cliente. El cambio se aplica sin reiniciar el servidor.
        </p>
      </div>
      <ServiceAccessPanel />
    </div>
  );
}
