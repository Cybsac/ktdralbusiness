"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { stationRequest as request } from '@/lib/station/client';
import { STATION_PAIR_KEY, STATION_PENDING_KEY, STATION_REFRESH_INTERVAL_MS, STATION_TERMINAL_KEY } from '@/lib/station/contracts';

let pendingPair: { token: string; promise: Promise<any> } | null = null;
function pairOnce(token: string) {
  if (!pendingPair || pendingPair.token !== token) {
    const promise = request({ action: 'pair', token });
    pendingPair = { token, promise };
    promise.finally(() => { if (pendingPair?.promise === promise) pendingPair = null; }).catch(() => {});
  }
  return pendingPair.promise;
}
export default function RemoteScannerPage() {
  const [terminalId, setTerminalId] = useState('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Preparando escáner...');
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef<{ readingId: string; text: string; terminalId: string } | null>(null);
  const sending = useRef(false);
  const [hasPending, setHasPending] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const last = useRef('');
  const [canRescan, setCanRescan] = useState(false);
  const [reachable, setReachable] = useState(false);
  useEffect(() => {
    let alive = true;
    let retryTimer: number | undefined;
    async function init() {
      try {
        const token = sessionStorage.getItem(STATION_PAIR_KEY);
        const saved = localStorage.getItem(STATION_TERMINAL_KEY);
        const result = token ? await pairOnce(token) : saved ? await request({ action: 'terminal', terminalId: saved }) : null;
        if (!result) throw new Error('Escanea primero el QR de una estación.');
        if (!alive) return;
        if (token) sessionStorage.removeItem(STATION_PAIR_KEY);
        localStorage.setItem(STATION_TERMINAL_KEY, result.terminalId);
        setTerminalId(result.terminalId); setActive(true); setMessage('Listo para escanear'); setError('');
        try {
          const savedPending = JSON.parse(sessionStorage.getItem(STATION_PENDING_KEY) || 'null');
          if (savedPending?.terminalId === result.terminalId && typeof savedPending.readingId === 'string' && typeof savedPending.text === 'string') {
            pending.current = savedPending; setHasPending(true); setMessage('Recuperando lectura pendiente');
          }
        } catch { sessionStorage.removeItem(STATION_PENDING_KEY); }
      } catch (e) { if (alive) {
        const pairing = sessionStorage.getItem(STATION_PAIR_KEY);
        sessionStorage.removeItem(STATION_PAIR_KEY);
        setError(e instanceof Error ? e.message : 'No se pudo vincular');
        setMessage('Escáner no disponible');
        if (!pairing && localStorage.getItem(STATION_TERMINAL_KEY)) retryTimer = window.setTimeout(init, STATION_REFRESH_INTERVAL_MS);
      } }
    }
    init(); return () => { alive = false; if (retryTimer) window.clearTimeout(retryTimer); };
  }, []);
  const deliver = useCallback(async () => {
    const reading = pending.current;
    if (!reading || sending.current || !navigator.onLine) return;
    sending.current = true;
    setIsSending(true);
    try {
      await request({ action: 'scan', ...reading });
      setReachable(true);
      pending.current = null;
      sessionStorage.removeItem(STATION_PENDING_KEY);
      setHasPending(false);
      setError('');
      setMessage('Lectura recibida por el sistema; pendiente de confirmación en la estación');
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lectura pendiente de envío');
      setMessage('Lectura pendiente: se reintentará al recuperar la conexión');
    } finally { sending.current = false; setIsSending(false); }
  }, []);
  useEffect(() => {
    if (!terminalId) return;
    const retry = () => {
      void deliver();
      void request({ action: 'terminal', terminalId }).then(() => setReachable(true)).catch(() => { setReachable(false); setError('No se pudo verificar la vinculación o la conexión.'); });
    };
    retry();
    const timer = window.setInterval(retry, STATION_REFRESH_INTERVAL_MS);
    window.addEventListener('online', retry);
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
  }, [terminalId, deliver]);
  const send = useCallback((text: string) => {
    if (!terminalId || pending.current) return;
    if (last.current === text) return;
    last.current = text;
    setCanRescan(true);
    pending.current = { terminalId, text, readingId: crypto.randomUUID() };
    setHasPending(true);
    try { sessionStorage.setItem(STATION_PENDING_KEY, JSON.stringify(pending.current)); } catch {}
    void deliver();
  }, [terminalId, deliver]);
  useEffect(() => {
    if (!active || !terminalId || !video.current) return;
    let alive = true;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader();
    reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, result => { if (alive && result) send(result.getText()); })
      .then(value => { if (alive) controls = value; else value.stop(); })
      .catch(() => { if (alive) setError('No se pudo abrir la cámara. Revisa los permisos.'); });
    return () => { alive = false; controls?.stop(); };
  }, [active, terminalId, send]);
  async function unlink() {
    if (pending.current) { setError('Hay una lectura pendiente. Espera a que se envíe antes de desvincular.'); return; }
    try { await request({ action: 'revoke', terminalId }); localStorage.removeItem(STATION_TERMINAL_KEY); setActive(false); setTerminalId(''); setMessage('Terminal desvinculado'); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo desvincular'); }
  }
  return <div className="max-w-xl mx-auto py-5 space-y-4"><Link href="/u/scanner" className="text-teal-600">← Volver al escáner</Link><h1 className="text-2xl font-bold">Escáner de estación</h1><p>{terminalId ? (reachable ? '● Conectado al servicio' : '● Verificando conexión') : message}</p>{error && <p role="alert" className="bg-red-100 text-red-800 rounded p-3">{error}</p>}<div className="rounded-xl overflow-hidden bg-black aspect-square"><video ref={video} autoPlay muted playsInline className="w-full h-full object-cover" /></div><p>{message}</p>{canRescan && !hasPending && <button className="border rounded-lg px-4 py-2" onClick={() => { last.current = ''; setCanRescan(false); }}>Permitir leer el mismo código otra vez</button>}{hasPending && <div className="flex gap-3"><button onClick={() => void deliver()} className="border rounded-lg px-4 py-2">Reintentar envío</button><button disabled={isSending} onClick={() => { if (window.confirm('¿Descartar la lectura pendiente?')) { pending.current = null; sessionStorage.removeItem(STATION_PENDING_KEY); setHasPending(false); setError(''); setMessage('Lectura descartada'); } }} className="border rounded-lg px-4 py-2">Descartar lectura</button></div>}<p className="text-sm">Las lecturas se envían a la estación; no realizan canjes.</p>{terminalId && <div className="flex gap-3"><button onClick={() => setActive(v => !v)} className="bg-teal-700 text-white rounded-lg px-5 py-3">{active ? 'Pausar cámara' : 'Activar cámara'}</button><button onClick={unlink} className="border border-red-500 text-red-600 rounded-lg px-5 py-3">Desvincular</button></div>}</div>;
}
