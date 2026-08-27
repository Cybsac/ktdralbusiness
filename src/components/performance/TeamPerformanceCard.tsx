'use client';

import { useEffect, useState } from 'react';
import { IconUsers } from '@tabler/icons-react';

type PerformanceSummary = {
  averageScore: number | null;
  level: 'MALO' | 'REGULAR' | 'BUENO' | 'MUY_BUENO' | null;
  evaluatedDays: number;
  closedDays: number;
};

type TeamPerformanceData = {
  week: PerformanceSummary;
  last30Days: PerformanceSummary;
  people: Array<{
    person: { id: string; name: string; code: string; area: string | null };
    week: PerformanceSummary;
    last30Days: PerformanceSummary;
  }>;
};

const LABELS = {
  MALO: 'Malo',
  REGULAR: 'Regular',
  BUENO: 'Bueno',
  MUY_BUENO: 'Muy Bueno',
} as const;

export default function TeamPerformanceCard() {
  const [data, setData] = useState<TeamPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'last30Days'>('week');

  useEffect(() => {
    fetch('/api/user/team-performance', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.ok) setData(payload.team);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  }

  if (!data) return null;

  const summary = data[period];
  const people = [...data.people].sort((a, b) => {
    const scoreA = a[period].averageScore;
    const scoreB = b[period].averageScore;
    if (scoreA === null && scoreB === null) return a.person.name.localeCompare(b.person.name);
    if (scoreA === null) return 1;
    if (scoreB === null) return -1;
    return scoreB - scoreA || a.person.name.localeCompare(b.person.name);
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Calificaciones individuales de trabajadores activos</p>
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            {(['week', 'last30Days'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === value ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {value === 'week' ? 'Esta semana' : 'Últimos 30 días'}
              </button>
            ))}
          </div>
          <div className="text-right text-xs text-slate-500 dark:text-slate-400">
            <div>{summary.closedDays} jornadas cerradas</div>
            <div>{summary.evaluatedDays} con calificación individual</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <tr>
                <th className="px-2 py-2 font-semibold">Trabajador</th>
                <th className="px-2 py-2 font-semibold">Área</th>
                <th className="px-2 py-2 text-center font-semibold">Promedio</th>
                <th className="px-2 py-2 text-center font-semibold">Evaluaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
              {people.map((item) => {
                const current = item[period];
                return (
                  <tr key={item.person.id}>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{item.person.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.person.code}</div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-600 dark:text-slate-300">{item.person.area || 'Sin área'}</td>
                    <td className="px-2 py-3 text-center">
                      {current.averageScore === null ? (
                        <span className="text-xs text-slate-400">Sin calificar</span>
                      ) : (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {current.level ? LABELS[current.level] : 'Sin nivel'} · {current.averageScore.toFixed(2)} / 4
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-slate-600 dark:text-slate-300">{current.evaluatedDays}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">Las jornadas cerradas sin calificación individual no se convierten en un promedio automático.</p>
      </div>
    </section>
  );
}
