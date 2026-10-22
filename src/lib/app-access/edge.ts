export type EdgeAppAccessState = {
  status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';
};

let cache: { state: EdgeAppAccessState; expiresAt: number } | null = null;

/**
 * Reads the public-safe access state without importing Prisma into middleware.
 * The short cache prevents a database request on every asset/page request while
 * keeping a suspension change effective quickly across instances.
 */
export async function getEdgeAppAccessState(requestUrl: string): Promise<EdgeAppAccessState | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.state;

  try {
    const url = new URL('/api/public/app-access', requestUrl);
    const response = await fetch(url, {
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const body = await response.json() as { status?: EdgeAppAccessState['status'] };
    const status = body.status;
    if (status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'MAINTENANCE') return null;

    const state = { status };
    cache = { state, expiresAt: now + 15_000 };
    return state;
  } catch {
    // A failed control-plane read must not create an accidental outage.
    return null;
  }
}
