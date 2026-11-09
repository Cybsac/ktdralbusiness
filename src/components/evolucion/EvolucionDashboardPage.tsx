'use client';

import React, { useState } from 'react';
import { DateTime } from 'luxon';

import WeeklyJourneyDashboard from '@/app/admin/daily-evaluation/WeeklyJourneyDashboard';

export default function EvolucionDashboardPage({ initialDay, showComments = false }: { initialDay: string; showComments?: boolean }) {
  const [defaultStart] = useState(() => DateTime.fromISO(initialDay, { zone: 'utc' }).minus({ months: 2 }).plus({ days: 1 }).toISODate() || initialDay);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(initialDay);
  const [range, setRange] = useState({ start: defaultStart, end: initialDay });
  const [rangeError, setRangeError] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Evolucion Operativa</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Consulta la evolución de jornadas, QR, pulseras, productos y cumpleaños.
          </p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); if (!start || !end || start > end) { setRangeError('Selecciona una fecha de inicio anterior o igual a la fecha final.'); return; } setRangeError(''); setRange({ start, end }); }} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">Desde<input type="date" required value={start} onChange={event => setStart(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-700 sm:text-sm" /></label>
          <label className="min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">Hasta<input type="date" required value={end} onChange={event => setEnd(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-700 sm:text-sm" /></label>
          <button type="submit" className="min-h-11 rounded-lg bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700">Aplicar fechas</button>
          {rangeError && <p role="alert" className="text-sm text-red-600 sm:col-span-3">{rangeError}</p>}
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300 sm:col-span-3">Mostrando del {range.start} al {range.end}, inclusive.</p>
        </form>
      </div>

      <WeeklyJourneyDashboard selectedDay={range.end} range={range} granularity="day" showComments={showComments} />
    </div>
  );
}
