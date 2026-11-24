/** Opens the existing token; never allocates or reveals a second prize. */
export function gamePrizeAccessPath(tokenId: string, theme?: string) {
  const path = `/marketing/ruleta?tokenId=${encodeURIComponent(tokenId)}`;
  return theme && theme !== 'default' ? `${path}&theme=${encodeURIComponent(theme)}` : path;
}
