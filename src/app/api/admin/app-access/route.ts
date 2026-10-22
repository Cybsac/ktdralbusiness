import { NextRequest, NextResponse } from 'next/server';
import { AppAccessStatus } from '@prisma/client';
import { getSessionCookieFromRequest, requireRole, verifySessionCookie } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getAppAccessState, updateAppAccessState } from '@/lib/app-access/service';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<AppAccessStatus>([
  AppAccessStatus.ACTIVE,
  AppAccessStatus.SUSPENDED,
  AppAccessStatus.MAINTENANCE,
]);

function readText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} debe ser texto`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${field} es inválido`);
  return text;
}

export async function GET(req: NextRequest) {
  const session = await verifySessionCookie(getSessionCookieFromRequest(req as unknown as Request));
  const auth = requireRole(session, ['ADMIN']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.error === 'UNAUTHORIZED' ? 401 : 403 });

  return NextResponse.json({ state: await getAppAccessState() });
}

export async function PATCH(req: NextRequest) {
  const session = await verifySessionCookie(getSessionCookieFromRequest(req as unknown as Request));
  const auth = requireRole(session, ['ADMIN']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.error === 'UNAUTHORIZED' ? 401 : 403 });

  try {
    const body = await req.json();
    const status = body?.status as AppAccessStatus;
    if (!VALID_STATUSES.has(status)) throw new Error('Estado de acceso inválido');

    const resumeAt = body?.resumeAt ? new Date(body.resumeAt) : null;
    if (resumeAt && Number.isNaN(resumeAt.getTime())) throw new Error('Fecha de reactivación inválida');

    const state = await updateAppAccessState({
      status,
      publicTitle: readText(body?.publicTitle, 'Título', 120),
      publicMessage: readText(body?.publicMessage, 'Mensaje', 1000),
      supportContact: typeof body?.supportContact === 'string' && body.supportContact.trim()
        ? body.supportContact.trim().slice(0, 200)
        : null,
      resumeAt,
      updatedBy: session?.userId ?? null,
    });

    await audit('app-access.updated', session?.userId, {
      status: state.status,
      publicTitle: state.publicTitle,
      publicMessage: state.publicMessage,
      supportContact: state.supportContact,
      resumeAt: state.resumeAt,
    });

    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo actualizar el acceso',
    }, { status: 400 });
  }
}
