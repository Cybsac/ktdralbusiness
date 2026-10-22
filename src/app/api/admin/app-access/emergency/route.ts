import { NextRequest, NextResponse } from 'next/server';
import { getAppAccessState } from '@/lib/app-access/service';
import {
  buildEmergencyAccessCookie,
  emergencyCodeMatches,
  issueEmergencyAccessCookie,
} from '@/lib/app-access/emergency';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const state = await getAppAccessState();
  if (state.status === 'ACTIVE') {
    return NextResponse.json({ error: 'El acceso de emergencia solo está disponible durante una suspensión.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  if (!emergencyCodeMatches(body?.code)) {
    return NextResponse.json({ error: 'Código de recuperación inválido.' }, { status: 401 });
  }

  const token = await issueEmergencyAccessCookie();
  if (!token) {
    return NextResponse.json({ error: 'El acceso de emergencia no está configurado.' }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, redirect: '/u/login?from=emergency&next=/admin/service-access' });
  response.headers.append('Set-Cookie', buildEmergencyAccessCookie(token));
  return response;
}
