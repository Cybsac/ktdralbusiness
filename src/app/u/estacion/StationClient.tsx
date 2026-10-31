"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useSocket } from '@/hooks/useSocket';
import { stationRequest as request } from '@/lib/station/client';
import { STATION_INVITATION_PREFIX, STATION_JOIN_EVENT, STATION_LEAVE_EVENT, STATION_REFRESH_EVENT, STATION_REFRESH_INTERVAL_MS, STATION_SESSION_KEY } from '@/lib/station/contracts';

type Terminal = { id: string; name: string; online: boolean };
type Station = { stationId: string; owner: string; expiresAt: string; terminals: Terminal[] };
type Reading = { id: string; text: string; senderName: string; createdAt: string };
export default function StationClient({ backHref = "/u" }: { backHref?: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [qr, setQr] = useState('');
  const [qrExpires, setQrExpires] = useState('');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { socket, isConnected } = useSocket();
  const [joined, setJoined] = useState(false);
  const refresh = useCallback(async (id: string) => {
    const result = await request({ action: 'status', stationId: id });
    setStation(result);
    setReadings(result.readings);
  }, []);
  useEffect(() => {
    const id = localStorage.getItem(STATION_SESSION_KEY);
    if (id) refresh(id).catch(() => setError('No se pudo recuperar la estación. Comprueba tu conexión o abre una nueva.'));
  }, [refresh]);
  useEffect(() => {
    if (!socket || !station?.stationId) return;
    const join = () => { setJoined(false); socket.emit(STATION_JOIN_EVENT, station.stationId, (result: { ok: boolean }) => setJoined(result.ok)); };
    const onRefresh = () => { refresh(station.stationId).catch(() => setError('No se pudo actualizar la estación')); };
    const disconnect = () => setJoined(false);
    socket.on('connect', join); socket.on('disconnect', disconnect); socket.on(STATION_REFRESH_EVENT, onRefresh);
    if (socket.connected) join();
    return () => { socket.emit(STATION_LEAVE_EVENT, station.stationId); socket.off('connect', join); socket.off('disconnect', disconnect); socket.off(STATION_REFRESH_EVENT, onRefresh); };
  }, [socket, station?.stationId, refresh]);
  useEffect(() => {
    if (!station?.stationId) return;
    const id = station.stationId;
    const timer = window.setInterval(() => { refresh(id).catch(() => setError('No se pudo actualizar la estación.')); }, STATION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [station?.stationId, refresh]);
  async function confirmReading(id: string) {
    if (!station) return;
    try { await request({ action: 'confirm', stationId: station.stationId, readingId: id }); await refresh(station.stationId); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar'); }
  }
  async function openStation() {
    setBusy(true); setError('');
    try { const result = await request({ action: 'create' }); localStorage.setItem(STATION_SESSION_KEY, result.stationId); await refresh(result.stationId); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la estación'); }
    finally { setBusy(false); }
  }
  async function invite() {
    if (!station) return;
    setBusy(true); setError('');
    try { const result = await request({ action: 'invite', stationId: station.stationId }); setQr(await QRCode.toDataURL(STATION_INVITATION_PREFIX + result.token, { margin: 2, width: 320 })); setQrExpires(result.expiresAt); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el QR'); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    try { await request({ action: 'revoke', terminalId: id }); if (station) await refresh(station.stationId); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo desvincular'); }
  }
  return <div className="max-w-5xl mx-auto py-6 space-y-5">
    <Link href={backHref} className="text-teal-600">← Volver</Link>
    <h1 className="text-3xl font-bold">Estación de operación</h1>
    {error && <p role="alert" className="rounded bg-red-100 text-red-800 p-3">{error}</p>}
    {!station ? <div className="rounded-xl bg-white dark:bg-slate-800 p-6"><p className="mb-4">Abre la estación y conecta un celular como escáner.</p><button disabled={busy} onClick={openStation} className="rounded-lg bg-teal-700 text-white px-6 py-4">Abrir estación</button></div> : <>
      <div className="rounded-xl bg-white dark:bg-slate-800 p-5 flex flex-wrap justify-between gap-3"><span>Operador: <strong>{station.owner}</strong></span><span>{isConnected && joined ? '● Estación conectada' : '● Actualización periódica'}</span><button onClick={invite} disabled={busy} className="rounded-lg bg-teal-700 text-white px-6 py-3">Conectar escáner</button></div>
      {qr && <div className="rounded-xl bg-white dark:bg-slate-800 p-5"><h2 className="text-xl font-semibold">Escanea este QR desde la app del colaborador</h2><img src={qr} alt="QR para vincular escáner" className="w-64 max-w-full" /><p className="text-sm">Válido hasta {new Date(qrExpires).toLocaleTimeString('es-PE')} y para una sola vinculación.</p><button onClick={() => setQr('')} className="mt-3 underline">Cerrar QR</button></div>}
      <section className="rounded-xl bg-white dark:bg-slate-800 p-5"><h2 className="text-xl font-semibold mb-3">Terminales vinculados</h2>{station.terminals.length ? station.terminals.map(t => <div key={t.id} className="flex justify-between items-center border-t py-3"><span>{t.name} · {t.online ? 'Conectado' : 'Desconectado'}</span><button className="text-red-600 px-3 py-2" onClick={() => revoke(t.id)}>Desvincular</button></div>) : <p>Aún no hay terminales vinculados.</p>}</section>
      <section className="rounded-xl bg-white dark:bg-slate-800 p-5"><h2 className="text-xl font-semibold mb-3">Lecturas recibidas</h2><p className="text-sm mb-3">Las lecturas no ejecutan canjes ni acciones del cliente.</p>{readings.length ? readings.map(r => <div key={r.id} className="border-t py-4"><p className="text-sm">{r.senderName} · {new Date(r.createdAt).toLocaleTimeString('es-PE')}</p><p className="break-all">{r.text}</p><button className="mt-2 bg-teal-700 text-white rounded-lg px-5 py-2" onClick={() => confirmReading(r.id)}>Confirmar recepción</button></div>) : <p>Esperando lecturas.</p>}</section>
    </>}
  </div>;
}
