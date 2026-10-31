/** Opens the existing token; never allocates or reveals a second prize. */
export function gamePrizeAccessPath(tokenId: string) {
  return `/marketing/ruleta?tokenId=${encodeURIComponent(tokenId)}`;
}
