"use client";

import { FormEvent, useEffect, useState } from 'react';

type AccessStatus = 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';

type AccessState = {
  status: AccessStatus;
  publicTitle: string;
  publicMessage: string;
  supportContact: string | null;
  resumeAt: string | null;
};

type FormState = {
  status: AccessStatus;
  publicTitle: string;
  publicMessage: string;
  supportContact: string;
  resumeAt: string;
};

function toLimaInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).replace(' ', 'T');
}

export default function ServiceAccessPanel() {
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/app-access')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración');
        const data = await response.json() as { state: AccessState };
        setForm({
          status: data.state.status,
          publicTitle: data.state.publicTitle,
          publicMessage: data.state.publicMessage,
          supportContact: data.state.supportContact || '',
          resumeAt: toLimaInput(data.state.resumeAt),
        });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Error cargando configuración'))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.status !== 'ACTIVE' && !window.confirm('Esto bloqueará el acceso de clientes. ¿Continuar?')) return;

    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/app-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          resumeAt: form.resumeAt ? new Date(form.resumeAt).toISOString() : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      const state = data.state as AccessState;
      setForm({
        status: state.status,
        publicTitle: state.publicTitle,
        publicMessage: state.publicMessage,
        supportContact: state.supportContact || '',
        resumeAt: toLimaInput(state.resumeAt),
      });
      setNotice('Configuración guardada correctamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando configuración…</p>;
  if (!form) return <p className="text-sm text-red-600 dark:text-red-400">{error || 'No hay configuración disponible.'}</p>;

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <div className={`rounded-2xl border p-5 ${form.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'}`}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estado actual</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {form.status === 'ACTIVE' ? 'La aplicación está disponible.' : 'Los clientes serán dirigidos a la página de suspensión.'}
        </p>
      </div>

      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        Estado de acceso
        <select value={form.status} onChange={(event) => update('status', event.target.value as AccessStatus)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400" >
          <option value="ACTIVE">Activo</option>
          <option value="SUSPENDED">Suspendido</option>
          <option value="MAINTENANCE">Mantenimiento</option>
        </select>
      </label>

      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        Título visible al cliente
        <input value={form.publicTitle} onChange={(event) => update('publicTitle', event.target.value)} maxLength={120} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400" />
      </label>

      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        Mensaje visible al cliente
        <textarea value={form.publicMessage} onChange={(event) => update('publicMessage', event.target.value)} maxLength={1000} required rows={5} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400" />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Contacto opcional
          <input value={form.supportContact} onChange={(event) => update('supportContact', event.target.value)} maxLength={200} placeholder="WhatsApp, correo o teléfono" className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400" />
        </label>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Reactivación estimada
          <input type="datetime-local" value={form.resumeAt} onChange={(event) => update('resumeAt', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-400" />
        </label>
      </div>

      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </form>
  );
}
