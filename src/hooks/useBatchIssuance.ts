"use client";
import { useEffect, useRef, useState } from "react";

import { ISSUANCE_POLICY } from "@/lib/prize-games/issuance-policy";
import type { IssuanceRequest } from "@/lib/prize-games/issuance-request";
interface Pending {
  key: string;
  payload: IssuanceRequest;
}
export interface IssuanceReceipt {
  batchId: string;
  totalTokens: number;
  downloadUrl: string;
  reused: boolean;
}
const STORAGE_KEY = "prizes:pending-issuance:v1";
export function useBatchIssuance(onCompleted: () => Promise<void>) {
  const lock = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<IssuanceReceipt | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.key === "string" && parsed.payload) setPending(parsed);
        else sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* Storage may be unavailable; the current page still retains its operation. */
    }
  }, []);
  const issue = async (payload?: IssuanceRequest) => {
    if (lock.current) return;
    const operation = pending || (payload ? { key: crypto.randomUUID(), payload } : null);
    if (!operation) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(operation));
    } catch {
      /* Keep the key in memory when storage is unavailable. */
    }
    lock.current = true;
    setPending(operation);
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ISSUANCE_POLICY.clientTimeoutMs);
    try {
      const response = await fetch("/api/batch/generate-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": operation.key,
        },
        body: JSON.stringify(operation.payload),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        if (
          response.status === 400 ||
          ["OPERATION_ARCHIVED", "INSUFFICIENT_STOCK", "STOCK_CHANGED"].includes(body.code)
        ) {
          setPending(null);
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            /* The operation remains cleared in memory. */
          }
        }
        throw new Error(body.message || "No se pudo completar la emisión");
      }
      if (
        typeof body.batchId !== "string" ||
        typeof body.downloadUrl !== "string" ||
        !Number.isSafeInteger(body.totalTokens)
      )
        throw new Error("No se recibió la confirmación completa. Recupera la misma emisión.");
      setReceipt(body);
      setPending(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* Completion is already stored on the server. */
      }
      await onCompleted();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sin conexión. Recupera la misma emisión; no necesitas generar otra."
      );
    } finally {
      clearTimeout(timeout);
      lock.current = false;
      setBusy(false);
    }
  };
  return { pending, busy, error, receipt, issue };
}
