"use client";

import { useSyncExternalStore } from "react";

let authorized = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
function refresh() {
  if (pending) return;
  pending = fetch("/api/static/session", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      const session = response.ok ? await response.json() : null;
      authorized = session?.canDeliverWithoutOtp === true;
    })
    .catch(() => {
      authorized = false;
    })
    .finally(() => {
      pending = null;
      listeners.forEach((listener) => listener());
    });
}
function onVisibility() {
  if (document.visibilityState === "visible") refresh();
}
function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      authorized = false;
    }
  };
}
const noSubscription = () => () => {};
const publicSession = () => false;
/** Cosmetic session state only; delivery authorization always stays on the server. */
export function usePrizeOperatorSession(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : noSubscription,
    () => authorized,
    publicSession
  );
}
