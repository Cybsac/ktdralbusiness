'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { prizeAuthorizedFetch } from '@/lib/prize-authorization/client';
import { REUSABLE_POLICY } from '@/lib/reusable-tokens/policy';

type Token = { id: string; label: string; usedCount: number; maxUses: number };

export default function ReusableGroupActions({ groupId, onDelivered, onBusyChange }: { groupId: string; onDelivered: () => void; onBusyChange: (busy: boolean) => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Token | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef<{ tokenId: string; key: string } | null>(null);
  const lock = useRef(false);

  const load = useCallback(async (preserveError = false) => {
    try {
      const response = await fetch(`/api/admin/daily-evaluation/reusable/${encodeURIComponent(groupId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los QR.');
      setTokens(data.tokens);
      if (!preserveError) setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los QR.');
    } finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REUSABLE_POLICY.availabilityRefreshMs);
    return () => window.clearInterval(timer);
  }, [load]);

  async function deliver() {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setMessage('');
    if (!operation.current || operation.current.tokenId !== selected.id) operation.current = { tokenId: selected.id, key: crypto.randomUUID() };
    try {
      const response = await prizeAuthorizedFetch(`/api/admin/reusable-tokens/${encodeURIComponent(selected.id)}/deliver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationKey: operation.current.key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'No se pudo registrar la entrega.');
      operation.current = null;
      setMessage(`Entrega registrada: ${selected.label}.`);
      setSelected(null);
      setShowQr(false);
      await load();
      onDelivered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrega.');
      void load(true);
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  }

  return <section className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
    <h4 className="text-sm font-semibold">QR disponibles para entregar</h4>
    <p className="mt-1 text-xs text-slate-500">Selecciona un premio para mostrar el QR o registrar su entrega. Las entregas se registran en la jornada actual.</p>
    {message && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error} <button className="underline" onClick={() => void load()}>Actualizar</button></p>}
    {loading ? <p className="mt-3 text-xs text-slate-500">Cargando QR…</p> : tokens.length === 0 ? <p className="mt-3 text-xs text-slate-500">No hay QR disponibles en este momento.</p> :
      <div className="mt-3 grid grid-cols-2 gap-2">
        {tokens.map(token => <button key={token.id} type="button" onClick={() => { setSelected(token); setShowQr(false); setMessage(''); setError(''); }} className="min-w-0 rounded-xl border border-teal-200 bg-teal-50 p-3 text-left hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-teal-800 dark:bg-teal-950/30 dark:hover:bg-teal-900/40">
          <span className="block break-words text-xs font-semibold text-slate-800 dark:text-slate-100">{token.label}</span>
          <span className="mt-1 block text-xs text-teal-700 dark:text-teal-300">{token.maxUses - token.usedCount} de {token.maxUses} usos disponibles</span>
          <span className="mt-1 block break-all text-[10px] text-slate-500">{token.id}</span>
        </button>)}
      </div>}
    {selected && <div className="mt-3 rounded-xl border border-teal-300 bg-white p-3 dark:border-teal-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2"><h5 className="text-sm font-semibold">{selected.label}</h5><button type="button" aria-label="Cerrar detalle del QR" disabled={busy} onClick={() => { setSelected(null); setShowQr(false); }} className="text-xl leading-none text-slate-500">×</button></div>
      {showQr && <img src={`/api/qr/${encodeURIComponent(selected.id)}`} alt={`QR de ${selected.label}`} className="mx-auto my-3 h-44 w-44 rounded bg-white p-1" />}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setShowQr(value => !value)} className="min-h-11 rounded-lg border border-teal-600 px-2 text-xs font-semibold text-teal-700 dark:text-teal-300">{showQr ? 'Ocultar QR' : 'Mostrar QR'}</button>
        <button type="button" disabled={busy || !tokens.some(token => token.id === selected.id)} onClick={() => void deliver()} className="min-h-11 rounded-lg bg-emerald-600 px-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Registrando…' : 'Registrar entrega'}</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Registrar entrega consume un uso y guarda al responsable autenticado.</p>
    </div>}
  </section>;
}
