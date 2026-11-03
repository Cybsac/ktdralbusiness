import { NextRequest } from 'next/server';
import { apiError, apiOk } from '@/lib/apiError';
import { checkRateLimit } from '@/lib/rateLimit';
import { corsHeadersFor } from '@/lib/cors';
import { isBirthdaysEnabledPublic } from '@/lib/featureFlags';
import { verifyClientSecret } from '@/lib/birthdays/clientAuth';
import { birthdayFailure } from '@/lib/birthdays/http';
import { cancelPublicReservation } from '@/lib/birthdays/reservation-status';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cors = corsHeadersFor(req);
  if (!isBirthdaysEnabledPublic()) return apiError('NOT_FOUND', 'Not found', undefined, 404, cors);
  const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
  const limit = checkRateLimit(`birthdays:cancel:${ip}`);
  if (!limit.ok) return apiError('RATE_LIMITED', 'Demasiadas solicitudes', undefined, 429, { ...cors, 'Retry-After': String(limit.retryAfterSeconds) });
  const body = await req.json().catch(() => null);
  const verified = verifyClientSecret(typeof body?.clientSecret === 'string' ? body.clientSecret : '');
  if (!verified.ok || verified.rid !== params.id) return apiError('UNAUTHORIZED', 'El enlace no es válido o ha vencido.', undefined, 403, cors);
  try { await cancelPublicReservation(params.id); return apiOk({ ok: true }, 200, cors); }
  catch (error) { return birthdayFailure(error, cors); }
}
export async function OPTIONS(req: NextRequest) { return new Response(null, { status: 204, headers: corsHeadersFor(req) }); }
