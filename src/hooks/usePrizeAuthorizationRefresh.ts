"use client";
import { useEffect, useRef } from "react";

import {
  PRIZE_AUTH_CHANGED,
  PRIZE_AUTH_POLL_MS,
  PRIZE_AUTH_SUBSCRIBE,
} from "@/lib/prize-authorization/realtime-contract";
import { createPrizeRefreshController } from "@/lib/prize-authorization/refresh-controller";

import { useSocket } from "./useSocket";

const MAX_TIMEOUT_MS = 2147483647;
// Coalesce concurrent invalidations. A change during an in-flight read always
// triggers another read, so an older HTTP response cannot be the final state.
export function usePrizeAuthorizationRefresh(
  refresh: (_signal: AbortSignal) => Promise<void>,
  validUntil?: string | null,
  invalidate?: () => void
) {
  const { socket, isConnected } = useSocket();
  const refreshRef = useRef(refresh);
  const invalidateRef = useRef(invalidate);
  const triggerRef = useRef<(_invalidate?: boolean) => void>(() => {});
  useEffect(() => {
    refreshRef.current = refresh;
    invalidateRef.current = invalidate;
  }, [refresh, invalidate]);
  useEffect(() => {
    const controller = createPrizeRefreshController(
      (signal) => refreshRef.current(signal),
      () => invalidateRef.current?.()
    );
    const trigger = (clear = false) => controller.refresh(clear);
    triggerRef.current = trigger;
    const onVisible = () => {
      if (document.visibilityState === "visible") trigger();
    };
    const onFocus = () => trigger();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    trigger();
    const timer = setInterval(trigger, PRIZE_AUTH_POLL_MS);
    return () => {
      controller.dispose();
      triggerRef.current = () => {};
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  useEffect(() => {
    if (!socket) return;
    const onChanged = () => triggerRef.current(true);
    socket.on(PRIZE_AUTH_CHANGED, onChanged);
    if (isConnected)
      socket.emit(PRIZE_AUTH_SUBSCRIBE, (result: { ok: boolean }) => {
        if (result?.ok) triggerRef.current();
      });
    return () => {
      socket.off(PRIZE_AUTH_CHANGED, onChanged);
    };
  }, [socket, isConnected]);
  useEffect(() => {
    if (!validUntil) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function arm() {
      const remaining = new Date(validUntil!).getTime() - Date.now();
      if (!Number.isFinite(remaining) || remaining < 0) return;
      timer = setTimeout(
        remaining >= MAX_TIMEOUT_MS ? arm : () => triggerRef.current(true),
        Math.min(remaining + 1, MAX_TIMEOUT_MS)
      );
    }
    arm();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [validUntil]);
}
