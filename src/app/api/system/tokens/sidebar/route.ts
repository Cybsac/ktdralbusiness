import { NextRequest, NextResponse } from 'next/server';
import { getPublicRouletteMetrics } from '@/lib/dailyTokenMetrics';
import { DAILY_EVALUATION_TIME_ZONE, isBusinessDay } from '@/lib/daily-evaluation';

export const dynamic = 'force-dynamic';
const SUMMARY_CACHE_MS = 15_000;
let cached: { day: string; until: number; value: Promise<Awaited<ReturnType<typeof getPublicRouletteMetrics>>> } | null = null;

function currentLimaDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_EVALUATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function publicMetrics(day: string) {
  if (cached?.day === day && cached.until > Date.now()) return cached.value;
  const value = getPublicRouletteMetrics(day);
  cached = { day, until: Date.now() + SUMMARY_CACHE_MS, value };
  value.catch(() => { if (cached?.value === value) cached = null; });
  return value;
}

function error(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const day = req.nextUrl.searchParams.get('day') ?? currentLimaDay();
    if (!isBusinessDay(day)) return error('INVALID_DAY', 'Formato day invalido');

    const data = await publicMetrics(day);

    return NextResponse.json({
      ok: true,
      day: data.day,
      basis: data.basis,
      summary: data.publicSidebar,
      metrics: { totalSpins: data.totalSpins },
    });
  } catch (e: any) {
    console.error('system/tokens/sidebar error', e);
    return error('INTERNAL', e?.message || 'internal error', 500);
  }
}
