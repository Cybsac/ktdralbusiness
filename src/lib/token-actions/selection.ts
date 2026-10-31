/** Stable selection across refreshes; not a unique participation-number allocator. */
export function tokenSelectionIndex(tokenId: string, count: number) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("INVALID_SELECTION_COUNT");
  let hash = 0;
  for (let i = 0; i < tokenId.length; i++) hash = ((hash << 5) - hash + tokenId.charCodeAt(i)) | 0;
  return Math.abs(hash) % count;
}
