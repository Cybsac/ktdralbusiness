'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REUSABLE_POLICY } from '@/lib/reusable-tokens/policy';
import { DAILY_EVALUATION_TIME_ZONE } from '@/lib/daily-evaluation';
import { RATING_OPTIONS } from '@/lib/daily-evaluation-options';
import type { Rating } from '@/lib/daily-evaluation';

export type ActivityProgress = { userId: string; displayName?: string; area?: string | null; total: number; points: number; ratingPoints: number; totalPoints: number; ratingBreakdown: { rating: Rating; count: number; points: number }[]; next: { threshold: number; points: number } | null; awards: { milestoneId: string; threshold: number; points: number; earnedAt: string }[] };

export function useActivityMilestones(scope: 'self' | 'team') {
  const [users, setUsers] = useState<ActivityProgress[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const response = await fetch(`/api/user/activity-milestones?scope=${scope}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudieron cargar los hitos.');
      const data = await response.json();
      if (current === version.current) { setUsers(data.users); setError(false); }
    } catch {
      if (current === version.current) setError(true);
    } finally { if (current === version.current) setLoading(false); }
  }, [scope]);
  useEffect(() => {
    setLoading(true);
    setUsers([]);
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(onVisible, REUSABLE_POLICY.availabilityRefreshMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => { version.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  return { users, error, loading, refresh };
}

export function ActivityMilestoneProgress({ progress }: { progress: ActivityProgress }) {
  const next = progress.next;
  return <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-900/10">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-teal-900 dark:text-teal-100">Puntos acumulados</h3><span className="text-sm font-bold text-teal-700 dark:text-teal-300">{progress.totalPoints} puntos</span></div>
    <p className="text-xs text-slate-600 dark:text-slate-300">Jornadas: {progress.ratingPoints} puntos · Hitos: {progress.points} puntos</p>
    {progress.ratingBreakdown.length > 0 && <details className="text-xs text-teal-700 dark:text-teal-300"><summary className="cursor-pointer font-medium">Ver puntos por jornadas</summary><ul className="mt-2 space-y-1">{progress.ratingBreakdown.map(item => <li key={item.rating}>{RATING_OPTIONS.find(option => option.value === item.rating)?.label ?? item.rating}: {item.count} {item.count === 1 ? 'jornada' : 'jornadas'} · {item.points} puntos</li>)}</ul></details>}
    <h4 className="pt-1 text-xs font-semibold text-teal-900 dark:text-teal-100">Hitos de actividad</h4>
    <p className="text-xs text-slate-600 dark:text-slate-300">{next ? `${progress.total}/${next.threshold} operaciones · faltan ${next.threshold - progress.total} para el siguiente hito` : `${progress.total} operaciones acumuladas`}</p>
    {next && <div role="progressbar" aria-label="Avance hacia el siguiente hito" aria-valuemin={0} aria-valuemax={next.threshold} aria-valuenow={progress.total} className="h-2 overflow-hidden rounded-full bg-teal-100 dark:bg-slate-700"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, progress.total / next.threshold * 100)}%` }} /></div>}
    {progress.awards.length > 0 && <details className="text-xs text-teal-700 dark:text-teal-300"><summary className="cursor-pointer font-medium">Ver hitos alcanzados ({progress.awards.length})</summary><ul className="mt-2 space-y-1">{progress.awards.map(award => <li key={award.milestoneId}>{award.threshold} operaciones · +{award.points} puntos · {new Date(award.earnedAt).toLocaleDateString('es-PE', { timeZone: DAILY_EVALUATION_TIME_ZONE })}</li>)}</ul></details>}
    <p className="text-[10px] text-slate-500">Incluye canjes y entregas con responsable registrado; no incluye llegadas de cumpleaños.</p>
  </div>;
}
