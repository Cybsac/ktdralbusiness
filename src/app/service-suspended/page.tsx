import { getAppAccessState } from '@/lib/app-access/service';

export const dynamic = 'force-dynamic';

function formatResumeAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export default async function ServiceSuspendedPage() {
  const state = await getAppAccessState();
  const resumeAt = formatResumeAt(state.resumeAt);
  const maintenance = state.status === 'MAINTENANCE';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-12 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/15 text-3xl">
            {maintenance ? '🛠️' : '⏸️'}
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            {maintenance ? 'Mantenimiento' : 'Acceso suspendido'}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{state.publicTitle}</h1>
          <p className="mx-auto mt-5 max-w-lg whitespace-pre-line text-base leading-7 text-slate-300">
            {state.publicMessage}
          </p>
          {resumeAt && (
            <p className="mt-6 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-300">
              Reactivación estimada: <strong className="text-white">{resumeAt}</strong>
            </p>
          )}
          {state.supportContact && (
            <p className="mt-4 text-sm text-slate-400">Contacto: <span className="text-slate-200">{state.supportContact}</span></p>
          )}
          <p className="mt-8 text-xs text-slate-500">Si ya realizaste el pago, espera unos minutos y vuelve a intentar.</p>
        </div>
      </section>
    </main>
  );
}
