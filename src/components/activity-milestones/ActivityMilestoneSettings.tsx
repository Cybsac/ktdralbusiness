'use client';

import { useState } from 'react';

type Rule = { id: string; threshold: number; points: number; enabled: boolean; awardsCount: number };
export function ActivityMilestoneSettings({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [threshold, setThreshold] = useState('');
  const [points, setPoints] = useState('');
  const [rulePoints, setRulePoints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      const response = await fetch('/api/admin/activity-milestones', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los hitos.');
      setRules(data.rules);
      setRulePoints(Object.fromEntries(data.rules.map((rule: Rule) => [rule.id, String(rule.points)])));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar los hitos.'); }
  }
  async function save(body: object) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/activity-milestones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      setThreshold(''); setPoints('');
      await load(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <div className="text-xs">
    <button type="button" onClick={() => { const next = !open; setOpen(next); if (next) void load(); }} className="rounded-lg border border-teal-300 px-3 py-2 font-medium text-teal-700 dark:border-teal-700 dark:text-teal-300">{open ? 'Cerrar configuración de hitos' : 'Configurar hitos'}</button>
    {open && <div className="mt-2 space-y-3 rounded-xl border border-teal-200 bg-white p-3 dark:border-teal-800 dark:bg-slate-800">
      <p className="text-slate-500">Los hitos nuevos se aplican al historial existente. Los puntos ya otorgados se conservan aunque se cambie el valor; desactivar un hito impide nuevas asignaciones.</p>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
      <div className="space-y-1">{rules.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-700/40"><span>{rule.threshold} operaciones <span className="text-slate-500">· {rule.awardsCount} asignados</span></span><form onSubmit={event => { event.preventDefault(); void save({ action: 'points', id: rule.id, points: Number(rulePoints[rule.id]) }); }} className="flex items-center gap-1"><label className="sr-only" htmlFor={`milestone-${rule.id}`}>Puntos para {rule.threshold} operaciones</label><input id={`milestone-${rule.id}`} type="number" min="0" step="1" required value={rulePoints[rule.id] ?? ''} onChange={event => setRulePoints(current => ({ ...current, [rule.id]: event.target.value }))} className="w-16 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" /><span>puntos</span><button type="submit" disabled={busy || rulePoints[rule.id] === String(rule.points)} className="rounded border border-teal-300 px-2 py-1 text-teal-700 disabled:opacity-50 dark:text-teal-300">Guardar</button></form><button type="button" disabled={busy} onClick={() => void save({ action: 'toggle', id: rule.id, enabled: !rule.enabled })} className="shrink-0 rounded border border-teal-300 px-2 py-1 font-medium text-teal-700 disabled:opacity-50 dark:text-teal-300">{rule.enabled ? 'Desactivar' : 'Activar'}</button></div>)}</div>
      <form onSubmit={event => { event.preventDefault(); void save({ action: 'create', threshold: Number(threshold), points: Number(points) }); }} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-24 flex-1 flex-col gap-1">Operaciones<input type="number" min="1" step="1" required value={threshold} onChange={event => setThreshold(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" /></label>
        <label className="flex min-w-20 flex-1 flex-col gap-1">Puntos<input type="number" min="0" step="1" required value={points} onChange={event => setPoints(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" /></label>
        <button disabled={busy} type="submit" className="rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Agregar hito'}</button>
      </form>
    </div>}
  </div>;
}
