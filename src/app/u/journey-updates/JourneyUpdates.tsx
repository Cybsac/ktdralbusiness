'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DAILY_EVALUATION_TIME_ZONE } from '@/lib/daily-evaluation';

type Update = { businessDay: string; comment: string | null; closedAt: string; registeredBy: string | null; closedBy: string | null };
type Filters = { start: string; end: string };

export default function JourneyUpdates() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [filters, setFilters] = useState<Filters>({ start: '', end: '' });
  const [items, setItems] = useState<Update[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const fetchPage = useCallback(async (selected: Filters, before?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (selected.start) params.set('start', selected.start);
    if (selected.end) params.set('end', selected.end);
    if (before) params.set('before', before);
    const response = await fetch(`/api/user/journey-updates?${params}`, { cache: 'no-store', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las novedades.');
    return data as { items: Update[]; nextCursor: string | null };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]); setNext(null);
    fetchPage(filters, undefined, controller.signal).then(data => { setItems(data.items); setNext(data.nextCursor); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudieron cargar las novedades.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, attempt, fetchPage]);

  async function loadMore() {
    if (!next || loading) return;
    setLoading(true); setError('');
    try { const data = await fetchPage(filters, next); setItems(current => [...current, ...data.items]); setNext(data.nextCursor); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudieron cargar más novedades.'); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[var(--color-bg)] px-3 py-4 sm:px-6 sm:py-8"><div className="mx-auto max-w-3xl space-y-4">
    <Link href="/u?tab=today" className="inline-block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">← Volver a Hoy</Link>
    <div><h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Novedades de jornada</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Comentarios registrados en jornadas cerradas.</p></div>
    <form onSubmit={event => { event.preventDefault(); setFilters({ start, end }); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">Desde<input type="date" value={start} max={end || undefined} onChange={event => setStart(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900" /></label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">Hasta<input type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900" /></label>
      <button className="min-h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={loading}>Consultar</button>
      <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50 dark:border-slate-600" type="button" disabled={loading} onClick={() => { setStart(''); setEnd(''); setFilters({ start: '', end: '' }); }}>Todo el historial</button>
    </form>
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error} <button type="button" className="underline" onClick={() => next ? void loadMore() : setAttempt(value => value + 1)}>Reintentar</button></p>}
    {!loading && !error && items.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500 dark:bg-slate-800">No hay novedades en el período seleccionado.</p>}
    <div className="space-y-3">{items.map(item => <article key={item.businessDay} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-slate-900 dark:text-slate-100">Jornada {item.businessDay}</h2><Link href={`/u/daily-evaluation?day=${encodeURIComponent(item.businessDay)}`} className="text-sm font-medium text-teal-700 underline dark:text-teal-300">Ver jornada</Link></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{item.comment}</p>
      <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400"><p>Evaluación registrada por: {item.registeredBy || 'No disponible'}</p><p>Cierre: {new Date(item.closedAt).toLocaleString('es-PE', { timeZone: DAILY_EVALUATION_TIME_ZONE })} · {item.closedBy || 'Responsable no disponible'}</p></div>
    </article>)}</div>
    {loading && <p role="status" className="text-sm text-slate-500">Cargando novedades…</p>}
    {next && !loading && <button type="button" onClick={() => void loadMore()} className="rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 dark:text-teal-300">Cargar más</button>}
    <p className="text-xs text-slate-500">Se muestra quién registró la evaluación o cerró la jornada; no necesariamente quién comunicó cada hecho mencionado.</p>
  </div></main>;
}
