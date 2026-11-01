"use client";

import { useEffect, useState } from 'react';
import { REUSABLE_POLICY, REUSABLE_TIMEZONE } from '@/lib/reusable-tokens/policy';

type Usage = 'all' | 'unused' | 'used';
interface Token {
  id: string; qrUrl: string; prize: { label: string; key: string; color: string | null };
  maxUses: number; usedCount: number; expiresAt: string; deletable: boolean;
}
interface Results { tokens: Token[]; pagination: { page: number; total: number; totalPages: number }; eligible: number; asOf: string }

export default function ReusableTokensPurgeAdmin() {
  const [data, setData] = useState<Results | null>(null);
  const [search, setSearch] = useState('');
  const [usage, setUsage] = useState<Usage>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allSnapshot, setAllSnapshot] = useState<string | null>(null);
  const [allCount, setAllCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(REUSABLE_POLICY.pageSize), search, usage });
        if (allSnapshot) params.set('asOf', allSnapshot);
        const response = await fetch(`/api/admin/reusable-tokens/all?${params}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'No se pudieron cargar los tokens.');
        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudieron cargar los tokens.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, usage, page, revision, allSnapshot]);

  const clearSelection = () => { setSelected(new Set()); setAllSnapshot(null); setAllCount(0); };
  const changeFilters = (nextSearch: string, nextUsage: Usage) => {
    clearSelection(); setPage(1); setSearch(nextSearch); setUsage(nextUsage); setMessage('');
  };
  const toggle = (id: string) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedCount = allSnapshot ? allCount : selected.size;

  const deleteSelection = async (oneId?: string) => {
    const count = oneId ? 1 : selectedCount;
    if (!count || !confirm(`¿Eliminar ${count} token(es) sin usos ni historial? Esta acción no se puede deshacer.`)) return;
    setDeleting(true); setError(''); setMessage('');
    let deleted = 0, skipped = 0;
    try {
      if (oneId || !allSnapshot) {
        const response = await fetch('/api/admin/reusable-tokens/bulk-delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenIds: oneId ? [oneId] : [...selected] }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'No se pudieron eliminar los tokens.');
        deleted = result.deleted; skipped = result.skipped;
      } else {
        let cursor: string | null = null;
        do {
          const response: Response = await fetch('/api/admin/reusable-tokens/bulk-delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: { search: search.trim(), usage, asOf: allSnapshot }, ...(cursor ? { cursor } : {}) }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || result.error || 'No se pudieron completar los lotes.');
          deleted += result.deleted; skipped += result.skipped;
          cursor = result.nextCursor;
          setMessage(`Eliminados hasta ahora: ${deleted}.`);
        } while (cursor);
        skipped += Math.max(0, count - deleted - skipped);
      }
      setMessage(`${deleted} token(es) eliminado(s)${skipped ? `; ${skipped} omitido(s) por cambios, usos o historial` : ''}.`);
    } catch (err) {
      setError(`${deleted ? `Se eliminaron ${deleted} token(es) antes del error. ` : ''}${err instanceof Error ? err.message : 'Error de conexión.'} Actualiza la lista antes de reintentar.`);
    } finally {
      clearSelection(); setDeleting(false); setPage(1); setRevision(value => value + 1);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Eliminar tokens reutilizables</h1>
      <div className="card"><div className="card-header"><h2 className="text-lg font-semibold">Filtros</h2></div>
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Buscar<input type="search" className="input mt-1 w-full" placeholder="Buscar por ID, premio o clave..." value={search} maxLength={200} disabled={deleting} onChange={event => changeFilters(event.target.value, usage)} /></label>
          <label className="text-sm font-medium">Estado de uso<select className="input mt-1 w-full" value={usage} disabled={deleting} onChange={event => changeFilters(search, event.target.value as Usage)}><option value="all">Todos los tokens</option><option value="unused">Solo sin usar</option><option value="used">Solo usados</option></select></label>
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {message && <div role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">{message}</div>}
      <div className="card">
        <div className="card-header space-y-3">
          <div><h2 className="text-lg font-semibold">Tokens reutilizables ({data?.pagination.total ?? 0})</h2><p className="text-sm text-slate-500">Solo pueden eliminarse tokens sin usos ni historial.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {allSnapshot ? <button type="button" className="btn-sm bg-slate-600 text-white" disabled={deleting} onClick={clearSelection}>Cancelar selección total</button> : <button type="button" className="btn-sm bg-blue-600 text-white disabled:opacity-50" disabled={loading || deleting || !data?.eligible} onClick={() => { if (data) { setSelected(new Set()); setAllSnapshot(data.asOf); setAllCount(data.eligible); } }}>Seleccionar todos los eliminables ({data?.eligible ?? 0})</button>}
            {selectedCount > 0 && <button type="button" className="btn-sm bg-red-600 text-white disabled:opacity-50" disabled={loading || deleting} onClick={() => void deleteSelection()}>{deleting ? 'Eliminando…' : `Eliminar seleccionados (${selectedCount})`}</button>}
          </div>
          {allSnapshot && <p className="text-xs text-slate-500">Selección de todos los resultados filtrados; los tokens con usos o historial se conservan.</p>}
        </div>
        <div className="card-body">
          {loading ? <p className="text-sm text-slate-500">Cargando tokens…</p> : !data?.tokens.length ? <p className="text-sm text-slate-500">No se encontraron tokens con estos filtros.</p> : <div className="space-y-3">
            {data.tokens.map(token => <div key={token.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <input type="checkbox" aria-label={`Seleccionar ${token.prize.label} ${token.id}`} className="mt-1 rounded border-slate-300" checked={allSnapshot ? token.deletable : selected.has(token.id)} disabled={deleting || !token.deletable || !!allSnapshot} onChange={() => {
                if (!selected.has(token.id) && selected.size >= REUSABLE_POLICY.maxBulkTokens) {
                  setError('Para seleccionar más tokens utiliza la selección total.');
                  return;
                }
                toggle(token.id);
              }} />
              <div className="min-w-0 flex-1"><div className="font-medium">{token.prize.label}</div><div className="break-all text-xs text-slate-500">{token.id}</div><div className="mt-1 text-xs text-slate-500">Usos: {token.usedCount}/{token.maxUses} · Expira: {new Date(token.expiresAt).toLocaleString('es-PE', { timeZone: REUSABLE_TIMEZONE })}</div>{!token.deletable && <div className="mt-1 text-xs text-amber-600">No eliminable: tiene usos o historial.</div>}</div>
              {token.deletable && <button type="button" className="btn-sm bg-red-600 text-white disabled:opacity-50" disabled={deleting || !!allSnapshot} onClick={() => void deleteSelection(token.id)}>Eliminar</button>}
            </div>)}
          </div>}
          {data && data.pagination.totalPages > 1 && <div className="mt-5 flex items-center justify-between gap-2 text-sm"><button className="btn-sm bg-slate-600 text-white disabled:opacity-50" disabled={loading || deleting || page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {data.pagination.totalPages}</span><button className="btn-sm bg-slate-600 text-white disabled:opacity-50" disabled={loading || deleting || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
        </div>
      </div>
    </div>
  );
}
