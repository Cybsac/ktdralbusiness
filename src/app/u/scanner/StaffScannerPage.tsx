"use client";
import { STATION_INVITATION_PREFIX, STATION_PAIR_KEY } from "@/lib/station/contracts";
import { prizeAuthorizedFetch } from "@/lib/prize-authorization/client";
import { classifyScannerTarget, observeScannerCode, type ScannerTarget } from "@/lib/scanner/classify";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import TicketScanPanel from './TicketScanPanel';
import CustomQrScanPanel from './CustomQrScanPanel';
import ScannerFlowPanel from './ScannerFlowPanel';
import {
  IconArrowLeft,
  IconCamera,
  IconCameraOff,
  IconHistory,
  IconPhoto,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
type Result = { getText(): string };

type ScanHistoryEntry = {
  id: string;
  ts: number;
  type:
    | "offer"
    | "birthday"
    | "invitation"
    | "reusable"
    | "static"
    | "mundial2026"
    | "fanzone"
    | "other"
    | "error";
  label: string;
  detail?: string;
  variant: "success" | "error" | "info";
};

// Small helpers --------------------------------------------------------------
function base64UrlToJson<T = unknown>(s: string): T | null {
  try {
    const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const str = atob(b64);
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

function isPersonQr(text: string): boolean {
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object" && j.pid && j.ts && j.sig) return true;
  } catch {}
  const j = base64UrlToJson<{ pid: string; ts: string; sig: string }>(text);
  return !!(j && j.pid && j.ts && j.sig);
}

function isGlobalQr(text: string): boolean {
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object" && j.kind === "GLOBAL") return true;
  } catch {}
  const j = base64UrlToJson<{ kind: string }>(text);
  return !!(j && j.kind === "GLOBAL");
}

function decodeOfferQrFromText(
  text: string
): { type: string; purchaseId: string; qrCode: string } | null {
  // Try JSON direct
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object" && j.type === "offer_purchase" && j.purchaseId && j.qrCode) {
      return j as { type: string; purchaseId: string; qrCode: string };
    }
  } catch {}
  return null;
}

function beep(freq = 880, duration = 120, type: OscillatorType = "sine", volume = 0.08) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = volume;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, duration);
  } catch {}
}

function vibrate(ms = 80) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

export default function StaffScannerPage({
  beforeScan,
}: { beforeScan?: (text: string) => Promise<void> } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const processingRef = useRef(false);
  const resultOpenRef = useRef(false);
  const lastSeenRef = useRef<{ text: string; at: number } | null>(null);
  const cooldownUntil = useRef(0);
  const setCooldownUntil = useCallback((until: number) => {
    cooldownUntil.current = until;
  }, []);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [activeTarget, setActiveTarget] = useState<ScannerTarget | null>(null);
  const [offerDelivering, setOfferDelivering] = useState(false);
  const offerDeliveryLock = useRef(false);

  const [banner, setBanner] = useState<{ variant: "success" | "error"; message: string; action?: { label: string; href: string } } | null>(
    null
  );
  const [offerOverlay, setOfferOverlay] = useState<{
    purchase: { customerName: string; amount: number; createdAt: string };
    offer: { title: string; price: number };
    status: string;
    purchaseId?: string;
    canComplete?: boolean;
  } | null>(null);

  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [scanCount, setScanCount] = useState({ total: 0, success: 0, error: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("staffScanHistory");
      if (stored) {
        const parsed = JSON.parse(stored) as ScanHistoryEntry[];
        if (Array.isArray(parsed)) {
          setScanHistory(parsed.slice(0, 50));
          const s = parsed.reduce(
            (a, e) => ({
              total: a.total + 1,
              success: a.success + (e.variant === "success" ? 1 : 0),
              error: a.error + (e.variant === "error" ? 1 : 0),
            }),
            { total: 0, success: 0, error: 0 }
          );
          setScanCount(s);
        }
      }
    } catch {}
  }, []);

  const addHistory = useCallback((entry: Omit<ScanHistoryEntry, "id" | "ts">) => {
    const newEntry: ScanHistoryEntry = { ...entry, id: crypto.randomUUID(), ts: Date.now() };
    setScanHistory((prev) => {
      const next = [newEntry, ...prev].slice(0, 50);
      try {
        localStorage.setItem("staffScanHistory", JSON.stringify(next));
      } catch {}
      return next;
    });
    setScanCount((prev) => ({
      total: prev.total + 1,
      success: prev.success + (entry.variant === "success" ? 1 : 0),
      error: prev.error + (entry.variant === "error" ? 1 : 0),
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setScanHistory([]);
    setScanCount({ total: 0, success: 0, error: 0 });
    try {
      localStorage.removeItem("staffScanHistory");
    } catch {}
  }, []);

  const processDecodedText = useCallback(
    async (text: string, source: 'camera' | 'image' = 'camera') => {
      if (!text) return;
      const now = Date.now();
      if (source === 'camera') {
        const observed = observeScannerCode(lastSeenRef.current, text, now, resultOpenRef.current || processingRef.current || now < cooldownUntil.current);
        lastSeenRef.current = observed.lastSeen;
        if (!observed.accept) return;
      }
      if (resultOpenRef.current || processingRef.current || now < cooldownUntil.current) return;
      processingRef.current = true;

      if (text.startsWith(STATION_INVITATION_PREFIX)) {
        const token = text.slice(STATION_INVITATION_PREFIX.length);
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
          setBanner({ variant: "error", message: "QR de estación inválido" });
          processingRef.current = false;
          return;
        }
        sessionStorage.setItem(STATION_PAIR_KEY, token);
        window.location.assign("/u/estacion/terminal");
        return;
      }

      if (beforeScan) {
        try {
          await beforeScan(text);
        } catch (error) {
          setBanner({
            variant: "error",
            message: `${error instanceof Error ? error.message : "No se pudo registrar la lectura"} Activa la cámara para reintentar.`,
          });
          setCameraActive(false);
          processingRef.current = false;
          return;
        }
      }

      // 1) Detect GLOBAL QR (attendance posters) — this scanner does NOT handle attendance
      if (isGlobalQr(text)) {
        setBanner({
          variant: "error",
          message: "Este escáner no registra asistencia. Usa el escáner de Entrada/Salida.",
          action: { label: 'Abrir asistencia', href: '/u/assistance' },
        });
        beep(220, 100, "square");
        vibrate(80);
        setCooldownUntil(Date.now() + 1500);
        processingRef.current = false;
        return;
      }

      // 1.5) Detect PERSON QR (attendance) — this scanner does NOT handle attendance
      if (isPersonQr(text)) {
        setBanner({
          variant: "error",
          message: "QR de asistencia detectado. Usa el escáner de Entrada/Salida para registrar.",
          action: { label: 'Abrir asistencia', href: '/u/assistance' },
        });
        beep(220, 100, "square");
        vibrate(80);
        setCooldownUntil(Date.now() + 1500);
        processingRef.current = false;
        return;
      }

      // 2) Detect OFFER QR: validate offer purchase
      const offerQrData = decodeOfferQrFromText(text);
      if (offerQrData) {
        try {
          const res = await fetch("/api/offers/validate-qr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qrData: text }),
          });
          const json = await res.json();

          if (json.valid) {
            resultOpenRef.current = true;
            setOfferOverlay({
              purchase: {
                customerName: json.purchase.customerName,
                amount: json.purchase.amount,
                createdAt: json.purchase.createdAt,
              },
              offer: {
                title: json.offer.title,
                price: json.offer.price,
              },
              status: json.status,
              purchaseId: json.purchase.purchaseId,
              canComplete: json.purchase.status === "PENDING",
            });
            addHistory({
              type: "offer",
              label: `Oferta: ${json.offer.title}`,
              detail: json.purchase.customerName,
              variant: "success",
            });
            setBanner({
              variant: "success",
              message: `✅ Oferta pendiente: ${json.purchase.customerName} - S/ ${json.purchase.amount.toFixed(2)}`,
            });
            beep(880, 120, "sine");
            vibrate(60);
            setCooldownUntil(Date.now() + 1200);
          } else {
            let errorMsg = "QR de oferta inválido";
            if (json.status === "expired") errorMsg = "QR de oferta expirado";
            else if (json.status === "used") errorMsg = "QR de oferta ya utilizado";
            else if (json.status === "cancelled") errorMsg = "Compra de oferta cancelada";
            else if (json.status === "refunded") errorMsg = "Compra de oferta reembolsada";

            addHistory({ type: "offer", label: errorMsg, variant: "error" });

            setBanner({ variant: "error", message: errorMsg });
            beep(220, 150, "square");
            vibrate(120);
            setCooldownUntil(Date.now() + 1000);
          }
        } catch (e: any) {
          setBanner({
            variant: "error",
            message: `Error al validar oferta: ${String(e?.message || e)}`,
          });
          beep(220, 150, "square");
          vibrate(120);
          setCooldownUntil(Date.now() + 1000);
        }
        processingRef.current = false;
        return;
      }

      // App routes are recognized centrally and opened locally; the destination keeps its own authorization.
      let target = classifyScannerTarget(text, window.location.origin);
      if (!target) {
        try {
          const response = await fetch('/api/user/scanner/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: text }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'No se pudo identificar el código.');
          target = data.target as ScannerTarget | null;
        } catch (error) {
          setBanner({ variant: 'error', message: `${error instanceof Error ? error.message : 'No se pudo identificar el código.'} Retira el QR y vuelve a intentarlo.` });
          processingRef.current = false;
          return;
        }
      }
      if (target) {
        resultOpenRef.current = true;
        setActiveTarget(target);
        addHistory({ type: "other", label: target.kind === 'page' ? target.label : target.kind === 'custom' ? 'QR personalizado' : target.kind === 'servicePoint' ? 'Punto de servicio' : target.package ? 'Paquete de entradas' : 'Ticket', variant: "info" });
        setBanner(null);
        beep(880, 120, "sine");
        vibrate(60);
        processingRef.current = false;
        return;
      }

      // Unrecognized QR
      addHistory({ type: "error", label: "QR no reconocido", variant: "error" });
      setBanner({ variant: "error", message: "QR no reconocido por este escáner" });
      beep(220, 150, "square");
      vibrate(120);
      setCooldownUntil(Date.now() + 800);
      processingRef.current = false;
    },
    [addHistory, beforeScan, setCooldownUntil]
  );

  const onFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
        await processDecodedText(result.getText(), 'image');
      } catch {
        setBanner({ variant: "error", message: "No se pudo leer el QR de la imagen" });
      } finally {
        URL.revokeObjectURL(url);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [processDecodedText]
  );

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!cameraActive || !pageVisible) return;
    let mounted = true;
    const reader = new BrowserMultiFormatReader();
    const videoEl = videoRef.current;
    if (!videoEl) return;
    let videoTrack: MediaStreamTrack | undefined;
    const onTrackEnded = () => { if (mounted) setCameraError('La cámara se detuvo. Pulsa Reintentar para activarla de nuevo.'); };
    setCameraError(null);
    const constraints: MediaStreamConstraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } } };

    reader
      .decodeFromConstraints(constraints, videoEl, (result: Result | null, _err: unknown) => {
        if (!mounted) return;
        if (result) {
          processDecodedText(result.getText());
        }
      })
      .then(async controls => {
        if (!mounted) { controls.stop(); return; }
        controlsRef.current = controls;
        videoTrack = (videoEl.srcObject as MediaStream | null)?.getVideoTracks()[0];
        videoTrack?.addEventListener('ended', onTrackEnded);
        try {
          const capabilities = videoTrack?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
          setTorchAvailable(Boolean(capabilities?.torch && controls.switchTorch));
        } catch { setTorchAvailable(false); }
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (mounted) setCameras(devices.filter(device => device.kind === 'videoinput'));
        } catch { /* Camera selection remains optional. */ }
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        const name = e instanceof Error ? e.name : '';
        setCameraError(name === 'NotAllowedError' ? 'Permite el acceso a la cámara en tu navegador.' : name === 'NotFoundError' ? 'No se encontró una cámara disponible.' : 'Revisa los permisos y la conexión de la cámara.');
      });

    return () => {
      mounted = false;
      videoTrack?.removeEventListener('ended', onTrackEnded);
      try { controlsRef.current?.stop(); } catch { /* La cámara puede haberse desconectado. */ }
      controlsRef.current = null;
      setTorchAvailable(false);
      setTorchOn(false);
    };
  }, [processDecodedText, cameraActive, pageVisible, deviceId, cameraAttempt]);

  const toggleCamera = useCallback(() => {
    setCameraError(null);
    setCameraActive((p) => !p);
  }, []);

  const retryCamera = useCallback(() => {
    setCameraError(null);
    setCameraActive(true);
    setCameraAttempt(value => value + 1);
  }, []);

  const closeResult = useCallback(() => {
    resultOpenRef.current = false;
    setActiveTarget(null);
    setOfferOverlay(null);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[var(--color-bg)] px-3 py-3 sm:px-4 sm:py-5 md:px-6 md:py-6">
      {/* Header bar */}
      <div className="w-full max-w-2xl mx-auto mb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
          >
            <IconArrowLeft size={18} />
            <span className="hidden sm:inline">Volver</span>
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">
            Escáner QR
          </h1>
          <button
            onClick={() => setShowHistory((p) => !p)}
            className={`relative flex items-center gap-1 text-sm px-2 py-1 rounded-lg transition-colors ${showHistory ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
          >
            <IconHistory size={18} />
            {scanCount.total > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-teal-500 text-white rounded-full px-1">
                {scanCount.total}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto flex flex-col lg:flex-row gap-3">
        {/* Main scanner column */}
        <div className="flex-1 min-w-0">
          {/* Banner */}
          {banner && (
            <div
              className={`mb-3 w-full text-center text-sm font-semibold rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 ${
                banner.variant === "success"
                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
              }`}
            >
              <span className="flex-1 text-left">{banner.message}</span>
              {banner.action && <a href={banner.action.href} className="shrink-0 underline">{banner.action.label}</a>}
              <button
                onClick={() => setBanner(null)}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
              >
                <IconX size={16} />
              </button>
            </div>
          )}

          {/* Camera viewport */}
          <div className="relative aspect-[3/4] max-h-[65dvh] w-full overflow-hidden rounded-2xl border-2 border-gray-200 bg-black shadow-lg dark:border-slate-600 sm:aspect-[4/3]">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />

            {/* Scanning guides */}
            {!offerOverlay && !cameraError && cameraActive && (
              <div className="pointer-events-none absolute inset-0">
                {/* Corner brackets */}
                <div className="absolute left-4 top-4 h-8 w-8 border-l-[3px] border-t-[3px] border-teal-400 rounded-tl-lg" />
                <div className="absolute right-4 top-4 h-8 w-8 border-r-[3px] border-t-[3px] border-teal-400 rounded-tr-lg" />
                <div className="absolute left-4 bottom-4 h-8 w-8 border-l-[3px] border-b-[3px] border-teal-400 rounded-bl-lg" />
                <div className="absolute right-4 bottom-4 h-8 w-8 border-r-[3px] border-b-[3px] border-teal-400 rounded-br-lg" />
                {/* Scan line animation */}
                <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-teal-400/50 animate-pulse" />
              </div>
            )}

            {/* Camera off state */}
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 text-white">
                <IconCameraOff size={48} className="opacity-40 mb-3" />
                <p className="text-sm opacity-60">Cámara pausada</p>
              </div>
            )}

            {/* Offer overlay */}
            {offerOverlay && (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-green-900/90 via-green-800/50 to-transparent pb-4 px-4 pt-4 text-white rounded-2xl">
                <div className="text-center max-w-full">
                  <div className="text-base font-bold leading-tight drop-shadow-lg mb-1">
                    🎁 {offerOverlay.offer.title}
                  </div>
                  <div className="text-sm opacity-90 truncate">
                    {offerOverlay.purchase.customerName}
                  </div>
                  <div className="text-xs opacity-80">
                    S/ {offerOverlay.purchase.amount.toFixed(2)}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(offerOverlay.purchase.createdAt).toLocaleDateString()}
                  </div>
                  {offerOverlay.canComplete && (
                    <button
                      className="pointer-events-auto mt-3 px-4 py-2 bg-white text-green-800 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition-colors text-sm"
                      disabled={offerDelivering}
                      onClick={async () => {
                        if (!offerOverlay.purchaseId || offerDeliveryLock.current) return;
                        offerDeliveryLock.current = true;
                        setOfferDelivering(true);
                        try {
                          const res = await prizeAuthorizedFetch("/api/offers/complete-delivery", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ purchaseId: offerOverlay.purchaseId }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            setBanner({
                              variant: "success",
                              message: "✅ Entrega completada exitosamente",
                            });
                            closeResult();
                            beep(880, 120, "sine");
                            vibrate(60);
                          } else {
                            setBanner({ variant: "error", message: data.message || data.error || 'No se pudo completar la entrega.' });
                            beep(220, 150, "square");
                            vibrate(120);
                          }
                        } catch (e: any) {
                          setBanner({
                            variant: "error",
                            message: `Error al completar entrega: ${String(e?.message || e)}`,
                          });
                          beep(220, 150, "square");
                          vibrate(120);
                        } finally { offerDeliveryLock.current = false; setOfferDelivering(false); }
                      }}
                    >
                      {offerDelivering ? 'Registrando…' : 'Completar entrega'}
                    </button>
                  )}
                  <div><button type="button" disabled={offerDelivering} onClick={closeResult} className="pointer-events-auto mt-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-white underline disabled:opacity-50">Seguir escaneando</button></div>
                </div>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-4 text-center text-white rounded-2xl">
                <IconCameraOff size={40} className="opacity-50 mb-3" />
                <p className="mb-1 font-bold text-sm">No se pudo acceder a la cámara</p>
                <p className="text-xs opacity-80 mb-3">{cameraError}</p>
                <button
                  onClick={retryCamera}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                >
                  <IconRefresh size={16} /> Reintentar
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={toggleCamera}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                cameraActive
                  ? "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                  : "border-teal-300 dark:border-teal-600 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30"
              }`}
            >
              {cameraActive ? (
                <>
                  <IconCameraOff size={16} /> Pausar
                </>
              ) : (
                <>
                  <IconCamera size={16} /> Activar
                </>
              )}
            </button>
            {torchAvailable && <button type="button" aria-pressed={torchOn} onClick={async () => { try { await controlsRef.current?.switchTorch?.(!torchOn); setTorchOn(value => !value); } catch { setBanner({ variant: 'error', message: 'No se pudo cambiar la linterna.' }); } }} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600">{torchOn ? 'Apagar luz' : 'Linterna'}</button>}
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
              <IconPhoto size={16} />
              Imagen
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
              />
            </label>
            <div className="flex-1" />
            {/* Session stats */}
            <div className="flex items-center gap-2 text-xs">
              {scanCount.success > 0 && (
                <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-semibold">
                  ✓ {scanCount.success}
                </span>
              )}
              {scanCount.error > 0 && (
                <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">
                  ✗ {scanCount.error}
                </span>
              )}
            </div>
          </div>
          {cameras.length > 1 && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">Cámara <select aria-label="Seleccionar cámara" value={deviceId} onChange={event => setDeviceId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-600 dark:bg-slate-800">{!deviceId && <option value="">Cámara trasera</option>}{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Cámara ${index + 1}`}</option>)}</select></label>}

          {/* Supported QR types info */}
          <div className="mt-3 px-1">
            <div className="flex flex-wrap gap-1.5 justify-center text-[10px] font-medium text-gray-500 dark:text-slate-500">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                🎁 Ofertas
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                🎂 Cumpleaños
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                🎟️ Invitaciones
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                🎫 Reutilizables
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                🎟️ Entradas
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">
                Y otros QR de la aplicación
              </span>
            </div>
          </div>
        </div>

        {/* History panel — inline on lg, slide-up on mobile */}
        {showHistory && (
          <div className="w-full lg:w-72 lg:flex-shrink-0">
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-700">
                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                  Historial
                </span>
                <div className="flex items-center gap-1">
                  {scanHistory.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <IconTrash size={12} /> Limpiar
                    </button>
                  )}
                  <button
                    onClick={() => setShowHistory(false)}
                    className="lg:hidden p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                  >
                    <IconX size={16} />
                  </button>
                </div>
              </div>
              <div className="max-h-64 lg:max-h-[60vh] overflow-y-auto">
                {scanHistory.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400 dark:text-slate-500">
                    Sin escaneos aún
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                    {scanHistory.map((entry) => (
                      <div key={entry.id} className="px-3 py-2 flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${entry.variant === "success" ? "bg-green-500" : entry.variant === "error" ? "bg-red-500" : "bg-blue-400"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-800 dark:text-slate-200 truncate">
                            {entry.label}
                          </div>
                          {entry.detail && (
                            <div className="text-[10px] text-gray-500 dark:text-slate-500 truncate">
                              {entry.detail}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-slate-600 flex-shrink-0 tabular-nums">
                          {new Date(entry.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {activeTarget?.kind === 'page' && <ScannerFlowPanel href={activeTarget.href} label={activeTarget.label} onClose={closeResult} />}
      {activeTarget?.kind === 'ticket' && <TicketScanPanel code={activeTarget.code} isPackage={activeTarget.package} onClose={closeResult} />}
      {activeTarget?.kind === 'custom' && <CustomQrScanPanel code={activeTarget.code} onClose={closeResult} />}
      {activeTarget?.kind === 'servicePoint' && <div role="dialog" aria-modal="true" aria-label="Punto de servicio" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"><div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-800"><h2 className="text-base font-semibold">Punto de servicio</h2><p className="text-sm font-medium">{activeTarget.label} · {activeTarget.location}</p><p className="text-xs text-slate-500">{activeTarget.active ? 'Disponible' : 'Inactivo'}</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={closeResult} className="min-h-11 rounded-lg border border-slate-300 text-sm dark:border-slate-600">Seguir escaneando</button><button type="button" onClick={() => setActiveTarget({ kind: 'page', label: 'Mesas y ubicaciones', href: '/u/mesas' })} className="min-h-11 rounded-lg bg-teal-700 text-sm font-semibold text-white">Ver mesas</button></div></div></div>}
    </div>
  );
}
