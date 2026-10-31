"use client";
import { useEffect, useState } from "react";

import type { NavigationGroup } from "./catalog";

export function useNavigationExpansion(
  groups: NavigationGroup[],
  activeHref: string | null,
  scope: string
) {
  const activeId = groups.find((group) => group.items.some((item) => item.href === activeHref))?.id;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeId ? [activeId] : []));
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const storageKey = `navigation:groups:${scope}`;
  useEffect(() => {
    const allowed = new Set(groups.map((group) => group.id));
    let restored: unknown;
    try {
      restored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      restored = null;
    }
    const next = new Set<string>(
      Array.isArray(restored)
        ? restored.filter((id) => typeof id === "string" && allowed.has(id))
        : []
    );
    if (activeId) next.add(activeId);
    setExpanded(next);
    setLoadedScope(scope);
  }, [groups, scope, storageKey, activeId]);
  useEffect(() => {
    if (activeId) setExpanded((previous) => new Set(previous).add(activeId));
  }, [activeId, activeHref]);
  useEffect(() => {
    if (loadedScope !== scope) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch {
      /* Storage is optional. */
    }
  }, [expanded, loadedScope, scope, storageKey]);
  const toggle = (id: string, forceOpen = false) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!forceOpen && next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { expanded, toggle };
}
