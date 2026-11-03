'use client';

import { useEffect, useState } from 'react';
import { IconUsers } from '@tabler/icons-react';

type PerformanceSummary = {
  points: number;
  evaluatedDays: number;
  closedDays: number;
};

type TeamPerformanceData = {
  period: PerformanceSummary & { start: string; end: string };
  people: Array<{
    person: { id: string; name: string; code: string; area: string | null };
    period: PerformanceSummary;
    activity: { total: number; points: number; ratingPoints: number; totalPoints: number; next: { threshold: number; points: number } | null } | null;
  }>;
};

export default function TeamPerformanceCard({ initialDay }: { initialDay: string }) {
  const [data, setData] = useState<TeamPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [start, setStart] = useState(initialDay);
  const [end, setEnd] = useState(initialDay);
  const [selection, setSelection] = useState({ start: initialDay, end: initialDay });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const params = new URLSearchParams(selection);
    fetch(`/api/user/team-performance?${params}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload?.ok || !Array.isArray(payload.team?.people)) throw new Error('Respuesta de rendimiento inválida');
        const complete = payload.team.people.every((item: TeamPerformanceData['people'][number]) =>
          typeof item.period?.points === 'number' &&
          (!item.activity || (typeof item.activity.ratingPoints === 'number' && typeof item.activity.totalPoints === 'number'))
        );
        if (!complete) throw new Error('Los puntos acumulados todavía no están disponibles');
        setData(payload.team);
      })
      .catch(() => { if (!controller.signal.aborted) setData(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, selection]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  }

  if (!data) return <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">No se pudo cargar el rendimiento. <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></p>;

  const summary = data.period;
  const people = [...data.people].sort((a, b) => {
    return b.period.points - a.period.points || a.person.name.localeCompare(b.person.name);
  });

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900 dark:bg-slate-800">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 px-3 py-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
            <IconUsers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 sm:text-xl">Rendimiento del equipo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Calificaciones e hitos de trabajadores activos</p>
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setSelection({ start, end: mode === 'day' ? start : end }); }}>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">Consultar
              <select value={mode} onChange={event => setMode(event.target.value as 'day' | 'range')} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-800">
                <option value="day">Una fecha</option><option value="range">Un período</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">{mode === 'day' ? 'Fecha' : 'Desde'}
              <input type="date" required value={start} onChange={event => { const value = event.target.value; setStart(value); if (value && value > end) setEnd(value); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-800" />
            </label>
            {mode === 'range' && <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">Hasta
              <input type="date" required value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-800" />
            </label>}
            <button type="submit" className="min-h-10 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700">Consultar</button>
          </form>
          <div className="text-right text-xs text-slate-500 dark:text-slate-400">
            <div>{summary.closedDays} jornadas cerradas</div>
            <div>{summary.evaluatedDays} con calificación individual</div>
            <div>{summary.start === summary.end ? summary.start : `${summary.start} al ${summary.end}`}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Trabajador</th>
                <th className="px-2 py-2 font-semibold">Área</th>
                <th className="px-2 py-2 text-center font-semibold">Puntos de jornadas<br /><span className="normal-case font-normal">Período seleccionado</span></th>
                <th className="px-2 py-2 text-center font-semibold">Puntos acumulados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
              {people.map((item) => {
                const current = item.period;
                return (
                  <tr key={item.person.id}>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{item.person.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.person.code}</div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-600 dark:text-slate-300">{item.person.area || 'Sin área'}</td>
                    <td className="px-2 py-3 text-center font-semibold text-emerald-700 dark:text-emerald-300">{current.points}</td>
                    <td className="px-2 py-3 text-center text-xs text-slate-600 dark:text-slate-300">
                      {item.activity ? <><span className="font-semibold text-teal-700 dark:text-teal-300">{item.activity.totalPoints} puntos</span><div>Jornadas: {item.activity.ratingPoints} · Hitos: {item.activity.points}</div><div>{item.activity.total} operaciones</div>{item.activity.next && <div>Próximo hito: {item.activity.next.threshold}</div>}</> : 'No disponible'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">Los puntos de jornadas corresponden al período seleccionado. El total acumulado suma todas las jornadas cerradas y los hitos. Al cerrar la jornada, no registrar salida reduce un nivel la calificación individual, hasta el mínimo.</p>
      </div>
    </section>
  );
}
