"use client";

import { FormEvent, useState } from 'react';

export default function RecoveryAccessForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/app-access/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo habilitar el acceso de recuperación.');
      window.location.href = data.redirect;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo habilitar el acceso de recuperación.');
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <form onSubmit={submit} className="w-full space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Recuperación administrativa</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Acceso de emergencia</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Usa el código seguro configurado para recuperar el control del servicio.</p>
        </div>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Código de recuperación
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            type="password"
            autoComplete="off"
            required
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900" type="submit">
          {pending ? 'Validando…' : 'Continuar al acceso administrativo'}
        </button>
      </form>
    </main>
  );
}
