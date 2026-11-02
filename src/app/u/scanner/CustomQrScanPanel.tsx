'use client';

import { useEffect, useRef, useState } from 'react';
import { prizeAuthorizedFetch } from '@/lib/prize-authorization/client';

type QrInfo = { id: string; customerName: string; usedCount: number; maxUses: number };
export default function CustomQrScanPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const [info, setInfo] = useState<QrInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/qr/validate/${encodeURIComponent(code)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'No se pudo consultar el QR.');
      setInfo(data.qr);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo consultar el QR.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code]);
  async function redeem() {
    if (!info || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await prizeAuthorizedFetch(`/api/admin/custom-qrs/${encodeURIComponent(info.id)}/redeem`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || 'No se pudo registrar el canje.');
      setInfo(current => current ? { ...current, usedCount: data.usedCount, maxUses: data.maxUses } : current);
      setMessage('Canje registrado.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar el canje.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-label="QR personalizado" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"><div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-800">
    <h2 className="text-base font-semibold">QR personalizado</h2>
    {loading ? <p className="text-sm text-slate-500">Consultando…</p> : info && <div className="text-sm"><p className="font-medium">{info.customerName}</p><p className="text-slate-500">{info.usedCount}/{info.maxUses} usos registrados</p></div>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 text-sm dark:border-slate-600">Seguir escaneando</button><button type="button" disabled={busy || loading || !info || !!message || info.usedCount >= info.maxUses} onClick={() => void redeem()} className="min-h-11 rounded-lg bg-teal-700 px-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Registrando…' : 'Registrar canje'}</button></div>
  </div></div>;
}
