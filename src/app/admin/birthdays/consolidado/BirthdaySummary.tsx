'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { birthdayDay } from '@/lib/birthdays/calendar';
import { birthdayReservationSourceLabel } from '@/lib/birthdays/attribution';
import { BIRTHDAY_POLICY } from '@/lib/birthdays/policy';

type Filters = { dateFrom: string; dateTo: string; dateField: 'date' | 'createdAt'; status: string; source: string; creator: string; packId: string; search: string };
type Reservation = { id: string; celebrantName: string; documento: string; phone: string; date: string; createdAt: string; timeSlot: string; status: string; reservationSource: string | null; guestsPlanned: number; guestArrivals: number; hostArrivedAt: string | null; wantsPhotoSession: boolean; pack: { name: string }; referrer: { name: string } | null; createdByUser: { username: string; person: { name: string | null } | null } | null };
type Data = { total: number; page: number; pageSize: number; statuses: { status: string; _count: { _all: number } }[]; guestsPlanned: number; guestArrivals: number; hostsArrived: number; items: Reservation[]; packs: { id: string; name: string; active: boolean }[]; creators: { id: string; name: string; username: string }[] };
const EMPTY: Filters = { dateFrom: '', dateTo: '', dateField: 'date', status: '', source: '', creator: '', packId: '', search: '' };
const STATUS_LABEL: Record<string, string> = { draft: 'Borrador', pending_review: 'Pendiente', approved: 'Aprobada', completed: 'Completada', canceled: 'Cancelada' };
const inputClass = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
function formatDay(value: string) { const day = birthdayDay(value); return day.isValid ? day.setLocale('es-PE').toFormat('dd/LL/yyyy') : 'No disponible'; }

export default function BirthdaySummary() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<'cards' | 'rows'>('cards');
  const [sort, setSort] = useState<{ by: 'date' | 'arrival'; direction: 'asc' | 'desc' }>({ by: 'date', direction: 'desc' });
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), sortBy: sort.by, sortDirection: sort.direction });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    setLoading(true); setError('');
    fetch(`/api/admin/birthdays/consolidado?${params}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar el consolidado.'); return result as Data;
    }).then(setData).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo cargar el consolidado.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, attempt, sort]);
  const set = (key: keyof Filters, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const toggleSort = (by: 'date' | 'arrival') => { setPage(1); setSort(current => ({ by, direction: current.by === by ? (current.direction === 'asc' ? 'desc' : 'asc') : 'desc' })); };
  const statusCount = (status: string) => data?.statuses.find(item => item.status === status)?._count._all ?? 0;
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <div><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Consolidado de cumpleaños</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Historial de reservas y llegadas. Los indicadores responden a los filtros seleccionados.</p></div>
    <form onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Filtrar por<select className={inputClass} value={draft.dateField} onChange={e => set('dateField', e.target.value)}><option value="date">Fecha de celebración</option><option value="createdAt">Fecha de registro</option></select></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Desde<input className={inputClass} type="date" max={draft.dateTo || undefined} value={draft.dateFrom} onChange={e => set('dateFrom', e.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Hasta<input className={inputClass} type="date" min={draft.dateFrom || undefined} value={draft.dateTo} onChange={e => set('dateTo', e.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Estado<select className={inputClass} value={draft.status} onChange={e => set('status', e.target.value)}><option value="">Todos</option>{BIRTHDAY_POLICY.statuses.map(status => <option key={status} value={status}>{STATUS_LABEL[status] || status}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Pack<select className={inputClass} value={draft.packId} onChange={e => set('packId', e.target.value)}><option value="">Todos</option>{data?.packs.map(pack => <option key={pack.id} value={pack.id}>{pack.name}{!pack.active ? ' (inactivo)' : ''}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Origen<select className={inputClass} value={draft.source} onChange={e => set('source', e.target.value)}><option value="">Todos</option><option value="PUBLIC">Público</option><option value="ADMIN">Administración</option><option value="USER_PORTAL">Portal /u</option><option value="LEGACY">Histórico registrado</option><option value="UNRECORDED">No registrado</option></select></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">Creada por<select className={inputClass} value={draft.creator} onChange={e => set('creator', e.target.value)}><option value="">Todos</option><option value="unrecorded">Sin usuario vinculado</option>{data?.creators?.map(user => <option key={user.id} value={`user:${user.id}`}>{user.name}{user.name !== user.username ? ` (${user.username})` : ''}</option>)}</select></label>
      <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">Buscar<input className={inputClass} value={draft.search} maxLength={200} onChange={e => set('search', e.target.value)} placeholder="Nombre, documento o teléfono" /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4"><button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Consultar</button><button type="button" onClick={() => { setDraft(EMPTY); setFilters({ ...EMPTY }); setPage(1); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">Limpiar filtros</button></div>
    </form>
    {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline">Reintentar</button></p>}
    {loading && <p role="status" className="text-sm text-slate-500">Cargando consolidado…</p>}
    {!loading && !error && data && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[['Reservas', data.total], ['Aprobadas', statusCount('approved')], ['Completadas', statusCount('completed')], ['Canceladas', statusCount('canceled')], ['Cumpleañeros que llegaron', data.hostsArrived], ['Invitados registrados', data.guestArrivals]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><div className="text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</div></div>)}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Invitados previstos: {data.guestsPlanned}. El estado de la reserva y la llegada son registros distintos.</p>
      <div className="flex gap-2" role="group" aria-label="Vista de reservas"><button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} className={`rounded-lg border px-3 py-2 text-sm ${view === 'cards' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600'}`}>Tarjetas</button><button type="button" aria-pressed={view === 'rows'} onClick={() => setView('rows')} className={`rounded-lg border px-3 py-2 text-sm ${view === 'rows' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 dark:border-slate-600'}`}>Filas</button></div>
      {data.items.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-slate-500 dark:bg-slate-800">No hay reservas para los filtros seleccionados.</p> : view === 'rows' ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><tr>
            <th className="px-3 py-3">Cumpleañero</th><th className="px-3 py-3">DNI</th><th className="px-3 py-3">Teléfono</th>
            <th className="px-3 py-3" aria-sort={sort.by === 'date' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort('date')} className="font-semibold underline" aria-label={`Ordenar fecha de celebración ${sort.by === 'date' && sort.direction === 'asc' ? 'de más reciente a más antigua' : 'de más antigua a más reciente'}`}>Fecha {sort.by === 'date' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
            <th className="px-3 py-3" aria-sort={sort.by === 'arrival' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort('arrival')} className="font-semibold underline" aria-label={`Ordenar llegada del cumpleañero: ${sort.by === 'arrival' && sort.direction === 'desc' ? 'sin llegada primero' : 'llegaron primero'}`}>Llegada {sort.by === 'arrival' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</button></th>
            <th className="px-3 py-3">Creada por</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{data.items.map(item => <tr key={item.id}><td className="px-3 py-3"><Link className="font-medium text-teal-700 underline dark:text-teal-300" href={`/admin/birthdays/${encodeURIComponent(item.id)}`}>{item.celebrantName}</Link></td><td className="px-3 py-3">{item.documento}</td><td className="px-3 py-3">{item.phone}</td><td className="px-3 py-3 whitespace-nowrap">{formatDay(item.date)}</td><td className="px-3 py-3">{item.hostArrivedAt ? 'Llegó' : 'Sin llegada registrada'}</td><td className="px-3 py-3">{item.createdByUser?.person?.name || item.createdByUser?.username || 'Sin usuario vinculado'}</td></tr>)}</tbody>
        </table>
      </div> : <div className="space-y-3">{data.items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{item.celebrantName}</h2><p className="text-xs text-slate-500">{STATUS_LABEL[item.status] || item.status} · {item.reservationSource ? birthdayReservationSourceLabel(item.reservationSource) : 'Origen no registrado'}</p></div><Link className="text-sm font-medium text-teal-700 underline dark:text-teal-300" href={`/admin/birthdays/${encodeURIComponent(item.id)}`}>Ver reserva</Link></div>
        <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-3"><div>Celebración: {formatDay(item.date)} · {item.timeSlot}</div><div>Registro: {new Date(item.createdAt).toLocaleString('es-PE', { timeZone: BIRTHDAY_POLICY.timezone })}</div><div>Pack: {item.pack.name}</div><div>Documento: {item.documento}</div><div>Teléfono: {item.phone}</div><div>Invitados: {item.guestArrivals} registrados / {item.guestsPlanned} previstos</div><div>Cumpleañero: {item.hostArrivedAt ? 'Llegada registrada' : 'Sin llegada registrada'}</div><div>Creada por: {item.createdByUser?.person?.name || item.createdByUser?.username || 'Sin usuario vinculado'}</div><div>Referidor: {item.referrer?.name || 'No registrado'}</div><div>Sesión de fotos: {item.wantsPhotoSession ? 'Sí' : 'No'}</div></div>
      </article>)}</div>}
      <div className="flex items-center justify-center gap-3 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded border px-3 py-2 disabled:opacity-40">← Anterior</button><span>Página {page}</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Siguiente →</button></div>
      <p className="text-xs text-slate-500">El pack corresponde a su información actual; los precios y beneficios históricos pueden no estar registrados. Las reservas eliminadas definitivamente no aparecen.</p>
    </>}
  </main>;
}
