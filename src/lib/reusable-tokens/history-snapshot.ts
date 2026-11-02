export type ReusableHistorySnapshot = {
  version: 1;
  group: { id: string; name: string; color: string | null } | null;
  prize: { id: string; label: string };
};

/** Older redemption notes have no snapshot; never treat a current group as historic fact. */
export function readReusableSnapshot(note: string | null): ReusableHistorySnapshot | null {
  if (!note) return null;
  try {
    const snapshot = JSON.parse(note)?.reusableSnapshot;
    if (snapshot?.version !== 1 || typeof snapshot.prize?.id !== 'string' || typeof snapshot.prize?.label !== 'string') return null;
    const group = snapshot.group;
    if (group !== null && (!group || typeof group.id !== 'string' || typeof group.name !== 'string' || (group.color !== null && typeof group.color !== 'string'))) return null;
    return snapshot as ReusableHistorySnapshot;
  } catch { return null; }
}
