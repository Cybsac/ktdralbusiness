import { NextResponse } from 'next/server';
import { getAppAccessState } from '@/lib/app-access/service';

export const dynamic = 'force-dynamic';

/** Minimal public control-plane response used by middleware before routing. */
export async function GET() {
  const state = await getAppAccessState();
  return NextResponse.json({ status: state.status }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
