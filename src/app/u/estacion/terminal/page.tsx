"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import StaffScannerPage from "@/app/u/scanner/StaffScannerPage";
import { stationRequest as request } from "@/lib/station/client";
import {
  STATION_PAIR_KEY,
  STATION_PENDING_KEY,
  STATION_REFRESH_INTERVAL_MS,
  STATION_SCAN_MAX_LENGTH,
  STATION_TERMINAL_KEY,
} from "@/lib/station/contracts";

type PendingReading = { readingId: string; text: string; terminalId: string };
let pendingPair: { token: string; promise: ReturnType<typeof request> } | null = null;
function pairOnce(token: string) {
  if (!pendingPair || pendingPair.token !== token) {
    const promise = request({ action: "pair", token });
    pendingPair = { token, promise };
    promise
      .finally(() => {
        if (pendingPair?.promise === promise) pendingPair = null;
      })
      .catch(() => {});
  }
  return pendingPair.promise;
}
export default function RemoteScannerPage() {
  const [terminalId, setTerminalId] = useState("");
  const [error, setError] = useState("");
  const [reachable, setReachable] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const pending = useRef<PendingReading | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    async function init() {
      let pairing = false;
      let restoring = false;
      try {
        const token = sessionStorage.getItem(STATION_PAIR_KEY);
        pairing = !!token;
        const saved = localStorage.getItem(STATION_TERMINAL_KEY);
        restoring = !!saved && !pairing;
        const result = token
          ? await pairOnce(token)
          : saved
            ? await request({ action: "terminal", terminalId: saved })
            : null;
        if (!result) throw new Error("Escanea primero el QR de una estación.");
        if (!alive) return;
        if (token) sessionStorage.removeItem(STATION_PAIR_KEY);
        localStorage.setItem(STATION_TERMINAL_KEY, result.terminalId);
        try {
          const savedPending = JSON.parse(sessionStorage.getItem(STATION_PENDING_KEY) || "null");
          if (
            savedPending?.terminalId === result.terminalId &&
            typeof savedPending.readingId === "string" &&
            typeof savedPending.text === "string"
          ) {
            pending.current = savedPending;
            setHasPending(true);
          } else sessionStorage.removeItem(STATION_PENDING_KEY);
        } catch {
          sessionStorage.removeItem(STATION_PENDING_KEY);
        }
        setTerminalId(result.terminalId);
        setReachable(true);
        setError("");
      } catch (error) {
        if (!alive) return;
        sessionStorage.removeItem(STATION_PAIR_KEY);
        setError(error instanceof Error ? error.message : "No se pudo vincular");
        if (restoring) retryTimer = setTimeout(init, STATION_REFRESH_INTERVAL_MS);
      } finally {
        if (alive) setInitializing(false);
      }
    }
    void init();
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);
  useEffect(() => {
    if (!terminalId) return;
    let alive = true;
    const heartbeat = () =>
      request({ action: "terminal", terminalId })
        .then(() => {
          if (alive) setReachable(true);
        })
        .catch(() => {
          if (alive) setReachable(false);
        });
    const timer = setInterval(heartbeat, STATION_REFRESH_INTERVAL_MS);
    window.addEventListener("online", heartbeat);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", heartbeat);
    };
  }, [terminalId]);
  const registerScan = useCallback(
    async (text: string) => {
      if (!terminalId || busy.current) throw new Error("Espera a que se registre la lectura.");
      if (text.length > STATION_SCAN_MAX_LENGTH)
        throw new Error("El contenido del QR es demasiado largo.");
      if (pending.current && pending.current.text !== text)
        throw new Error("Vuelve a escanear el QR pendiente o descártalo antes de continuar.");
      const reading = pending.current ?? { terminalId, text, readingId: crypto.randomUUID() };
      pending.current = reading;
      setHasPending(true);
      try {
        sessionStorage.setItem(STATION_PENDING_KEY, JSON.stringify(reading));
      } catch {
        /* Retain in memory when storage is unavailable. */
      }
      busy.current = true;
      setSending(true);
      try {
        await request({ action: "scan", ...reading });
        pending.current = null;
        setHasPending(false);
        setReachable(true);
        setError("");
        try {
          sessionStorage.removeItem(STATION_PENDING_KEY);
        } catch {}
      } catch (error) {
        setReachable(false);
        throw new Error(
          `${error instanceof Error ? error.message : "No se pudo registrar"}. Vuelve a escanear el mismo QR para reintentar.`
        );
      } finally {
        busy.current = false;
        setSending(false);
      }
    },
    [terminalId]
  );
  const requirePairing = useCallback(async () => {
    throw new Error("Escanea el QR de vinculación de la estación para conectar este celular.");
  }, []);
  async function unlink() {
    if (pending.current || busy.current) {
      setError("Envía o descarta la lectura pendiente antes de desvincular.");
      return;
    }
    try {
      await request({ action: "revoke", terminalId });
      localStorage.removeItem(STATION_TERMINAL_KEY);
      setTerminalId("");
      setReachable(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo desvincular");
    }
  }
  return (
    <div className="min-w-0 space-y-4 py-5">
      <div className="mx-auto max-w-5xl space-y-3">
        <Link href="/u/scanner" className="text-teal-600">
          ← Volver al escáner
        </Link>
        <h1 className="text-2xl font-bold">Escáner vinculado</h1>
        <p>
          {terminalId
            ? reachable
              ? "Conectado a la estación"
              : "Verificando conexión con la estación"
            : "Escáner no vinculado"}
        </p>
        <p className="text-sm">{terminalId ? 'Escanea y realiza el canje desde este teléfono. La estación registra la lectura.' : 'Apunta la cámara al QR de vinculación mostrado en la estación de administración.'}</p>
        {error && (
          <p role="alert" className="rounded bg-red-100 p-3 text-red-800">
            {error}
          </p>
        )}
        {hasPending && (
          <div className="rounded border p-3 text-sm">
            <p>
              Hay una lectura pendiente. Escanea el mismo QR para enviarla y continuar con su canje.
            </p>
            <button
              disabled={sending}
              className="mt-2 underline"
              onClick={() => {
                if (window.confirm("¿Descartar la lectura pendiente?")) {
                  pending.current = null;
                  setHasPending(false);
                  try {
                    sessionStorage.removeItem(STATION_PENDING_KEY);
                  } catch {}
                }
              }}
            >
              Descartar lectura
            </button>
          </div>
        )}
        {terminalId && (
          <button
            disabled={sending}
            onClick={unlink}
            className="rounded-lg border border-red-500 px-5 py-3 text-red-600"
          >
            Desvincular
          </button>
        )}
      </div>
      {initializing ? <p role="status" className="mx-auto max-w-5xl text-sm">Comprobando la conexión…</p> : <StaffScannerPage beforeScan={terminalId ? registerScan : requirePairing} />}
    </div>
  );
}
