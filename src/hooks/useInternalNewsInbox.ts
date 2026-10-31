"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { INTERNAL_NEWS_COMPLETED_EVENT } from "@/lib/internal-news/contracts";

export interface InternalNewsInboxItem {
  id: string;
  title: string;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  mandatory: boolean;
  includeTrivia: boolean;
  assignedAt: string;
  completedAt: string | null;
  preview: string;
  content: string | null;
  revision: number;
}
export function useInternalNewsInbox() {
  const [inboxItems, setItems] = useState<InternalNewsInboxItem[]>([]);
  const [inboxLoading, setLoading] = useState(false);
  const [inboxHasMore, setHasMore] = useState(false);
  const [inboxError, setError] = useState<string | null>(null);
  const [pendingCount, setPending] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const state = useRef({ page: 0, loading: false, loaded: false });
  const controller = useRef<AbortController | null>(null);
  const fetchPage = useCallback(async (more = false, refresh = false) => {
    if (!refresh && (state.current.loading || (!more && state.current.loaded))) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const page = more ? state.current.page + 1 : 1;
    state.current.loading = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/commitment/inbox?page=${page}`, {
        signal: request.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error();
      if (request.signal.aborted) return;
      setItems((prev) =>
        more
          ? [
              ...prev,
              ...data.items.filter(
                (item: InternalNewsInboxItem) => !prev.some((existing) => existing.id === item.id)
              ),
            ]
          : data.items
      );
      state.current.page = page;
      state.current.loaded = true;
      setHasMore(data.hasMore);
      setPending(data.pendingCount);
    } catch {
      if (!request.signal.aborted) setError("No se pudo cargar la bandeja. Intenta nuevamente.");
    } finally {
      if (controller.current === request) {
        state.current.loading = false;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    const currentState = state.current;
    void fetchPage();
    const refresh = () => {
      setOpenItemId(null);
      void fetchPage(false, true);
    };
    window.addEventListener(INTERNAL_NEWS_COMPLETED_EVENT, refresh);
    return () => {
      controller.current?.abort();
      currentState.loading = false;
      window.removeEventListener(INTERNAL_NEWS_COMPLETED_EVENT, refresh);
    };
  }, [fetchPage]);
  const reading = useRef(new Set<string>());
  const markAsRead = async (item: InternalNewsInboxItem) => {
    if (
      item.status !== "PENDING" ||
      item.mandatory ||
      item.includeTrivia ||
      reading.current.has(item.id)
    )
      return;
    reading.current.add(item.id);
    try {
      const response = await fetch("/api/user/commitment/inbox/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: item.id }),
      });
      if (!response.ok) throw new Error();
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, status: "COMPLETED", completedAt: new Date().toISOString() }
            : row
        )
      );
      setPending((n) => Math.max(0, n - 1));
    } catch {
      setError("No se pudo registrar la lectura. Vuelve a abrir el comunicado.");
    } finally {
      reading.current.delete(item.id);
    }
  };
  return {
    inboxItems,
    inboxLoading,
    inboxHasMore,
    inboxError,
    pendingCount,
    openItemId,
    setOpenItemId,
    fetchInbox: fetchPage,
    markAsRead,
  };
}
