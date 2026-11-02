'use client';

import { useEffect, useRef, useState } from 'react';

type PackageInfo = { customerName: string; showTitle: string; remainingEntries: number; status: string };
export default function TicketScanPanel({ code, isPackage, onClose }: { code: string; isPackage: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(isPackage);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    if (!isPackage) return;
    const controller = new AbortController();
    void fetch(`/api/tickets/validate-package?qrCode=${encodeURIComponent(code)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el paquete.');
      setInfo(data.package);
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo consultar el paquete.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code, isPackage]);
  async function validate() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(isPackage ? '/api/tickets/validate-package' : '/api/tickets/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrCode: code }) });
      const data = await response.json();
      if (!response.ok || (isPackage ? !data.ok : data.valid !== true)) throw new Error(data.error || 'No se pudo validar la entrada.');
      if (isPackage) setInfo(data.package);
      setMessage(isPackage ? 'Entrada del paquete validada.' : 'Ticket validado.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo validar la entrada.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div role="dialog" aria-modal="true" aria-label={isPackage ? 'Paquete de entradas' : 'Ticket'} className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
    <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-800">
      <h2 className="text-base font-semibold">{isPackage ? 'Paquete de entradas' : 'Ticket'}</h2>
      {loading ? <p className="text-sm text-slate-500">Consultando…</p> : info ? <div className="text-sm"><p className="font-medium">{info.customerName}</p><p>{info.showTitle}</p><p className="text-slate-500">{info.remainingEntries} entradas disponibles · {info.status}</p></div> : <p className="break-all text-xs text-slate-500">{code}</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-slate-300 text-sm dark:border-slate-600">Seguir escaneando</button><button type="button" disabled={busy || loading || !!message || (isPackage && (!info || info.remainingEntries <= 0))} onClick={() => void validate()} className="min-h-11 rounded-lg bg-teal-700 px-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Validando…' : 'Validar entrada'}</button></div>
    </div>
  </div>;
}
