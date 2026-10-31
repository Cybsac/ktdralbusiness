import { NextResponse } from 'next/server';
import { getPrizeOperator } from '@/lib/prize-authorization/service';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const session = await getPrizeOperator(req);
    return NextResponse.json({ ok: !!session, isStaff: !!session, isAdmin: session?.role === 'ADMIN', role: session?.role ?? null, canDeliverWithoutOtp: !!session }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, isStaff: false, isAdmin: false, canDeliverWithoutOtp: false }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
