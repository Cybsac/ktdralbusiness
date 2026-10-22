export type EdgeAppAccessState = {
  status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';
};

let cache: { state: EdgeAppAccessState; expiresAt: number } | null = null;

const PRODUCTION_CONTROL_ORIGIN = 'https://tokensapp-production.up.railway.app';

/**
 * Reads the public-safe access state without importing Prisma into middleware.
 * The short cache prevents a database request on every asset/page request while
 * keeping a suspension change effective quickly across instances.
 */
export async function getEdgeAppAccessState(requestUrl: string): Promise<EdgeAppAccessState | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.state;

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const controlOrigin = process.env.APP_ACCESS_CONTROL_BASE_URL
      || (process.env.NODE_ENV === 'production' ? PRODUCTION_CONTROL_ORIGIN : requestOrigin);
    const url = new URL('/api/public/app-access', controlOrigin);
    const response = await fetch(url, {
      headers: { 'x-app-access-probe': '1' },
      cache: 'no-store',
    });
    if (!response.ok) return process.env.NODE_ENV === 'production' ? { status: 'SUSPENDED' } : null;

    const body = await response.json() as { status?: EdgeAppAccessState['status'] };
    const status = body.status;
    if (status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'MAINTENANCE') {
      return process.env.NODE_ENV === 'production' ? { status: 'SUSPENDED' } : null;
    }

    const state = { status };
    cache = { state, expiresAt: now + 15_000 };
    return state;
  } catch {
    // Production fails closed: a billing suspension must never be bypassed
    // just because the control-plane request was unavailable.
    return process.env.NODE_ENV === 'production' ? { status: 'SUSPENDED' } : null;
  }
}
