'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Rating } from '@/lib/daily-evaluation';
import { RATING_OPTIONS } from '@/lib/daily-evaluation-options';
import { ALLOWED_AREAS } from '@/lib/areas';
import CloseDayModal from './CloseDayModal';


interface PersonInfo {
  id: string;
  name: string;
  code: string;
  area: string | null;
}

interface AttendanceEntry {
  person: PersonInfo;
  firstIn: string | null;
  lastOut: string | null;
  missingExit: boolean;
  evaluable: boolean;
}

interface DeliveredPrize {
  label: string;
  count: number;
  operators: { name: string; count: number }[];
}

interface DayPrize {
  id: string;
  label: string;
}

interface ReusableGroupPrize {
  label: string;
  total: number;
  daySales: number;
}

interface ReusableGroup {
  id: string;
  name: string;
  color: string | null;
  totalTokens: number;
  activeTokens: number;
  daySales: number;
  prizes: ReusableGroupPrize[];
}

interface StaticBatchDeliveredPrize {
  label: string;
  color: string | null;
  count: number;
}

interface StaticBatchSummary {
  interactive: {
    batchId: string;
    batchName: string | null;
    total: number;
    available: number;
    availablePrizes: StaticBatchDeliveredPrize[];
    unavailable: number;
    disabled: number;
    expired: number;
    upcoming: number;
    redeemed: number;
    redeemedPrizes: StaticBatchDeliveredPrize[];
    inCirculation: number;
    circulationPrizes: StaticBatchDeliveredPrize[];
    deliveredToday: number;
    deliveredPrizes: (StaticBatchDeliveredPrize & { operators: { name: string; count: number }[] })[];
  } | null;
  deliveredToday: number;
  deliveredPrizes: StaticBatchDeliveredPrize[];
  revealedToday: number;
  revealedPrizes: StaticBatchDeliveredPrize[];
  inCirculation: number;
  circulationPrizes: StaticBatchDeliveredPrize[];
  availableTotal: number;
  availablePrizes: StaticBatchDeliveredPrize[];
}

interface SummaryData {
  attendance: AttendanceEntry[];
  deliveredPrizes: DeliveredPrize[];
  totalDelivered: number;
  dayPrizes: DayPrize[];
  totalTokensInBatches: number;
  programmedPrizes: { id: string; label: string; count: number }[];
  programmedBatches: { id: string; description: string | null; count: number }[];
  totalPlayed: number;
  playedPrizes: { id: string; label: string; count: number; pending: number }[];
    birthdays: {
      approvedTotal: number;
      approvedArrived: number;
      approvedGuests: number;
      approvedGuestArrivals: number;
      pendingReview: number;
      draftCount: number;
      packs: { name: string; count: number }[];
      total: number;
      arrived: number;
      totalGuests: number;
      arrivedGuests: number;
      reservations: {
        id: string;
        celebrantName: string;
        timeSlot: string;
        status: string;
        guestsPlanned: number;
        guestArrivals: number;
        hostArrived: boolean;
        wantsPhotoSession: boolean;
        packName: string | null;
      }[];
    };
  specialGuests: {
    total: number;
    arrived: number;
    lastArrivalAt: string | null;
    events: {
      id: string;
      name: string;
      timeSlot: string;
      totalGuests: number;
      arrivedGuests: number;
    }[];
    guests: {
      id: string;
      guestName: string;
      guestCategory: string | null;
      status: string;
      arrivedAt: string | null;
      eventName: string;
      eventTime: string;
    }[];
  };
  reusableGroups: ReusableGroup[];
  staticBatches: StaticBatchSummary | null;
}

interface DailyEvaluation {
  id: string;
  businessDay: string;
  rating: Rating | null;
  comment: string | null;
  closedAt: string | null;
  closedByUserId: string | null;
  closedByName?: string | null;
  evaluatedByName?: string | null;
}

interface PersonRating {
  id: string;
  personId: string;
  rating: Rating;
  note: string | null;
  person: PersonInfo;
}

interface JourneyOperatorStats {
  userId: string;
  displayName: string;
  username: string;
  role: string;
  area: string | null;
  attendanceScans: number;
  reusableDeliveries: number;
  reusableRedemptions: number;
  birthdayRedemptions: number;
  reusableGroups: Array<{ id: string | null; name: string; color: string | null; deliveries: number; redemptions: number; total: number }>;
  rouletteDeliveries: number;
  customQrRedemptions: number;
  totalActions: number;
}

interface JourneyHistoryEvent {
  id: string;
  type: string;
  label: string;
  groupName: string | null;
  createdAt: string;
}

interface JourneyHistoryResponse {
  ok: boolean;
  day: string;
  category?: 'reusable' | 'birthday' | 'roulette';
  operator: {
    userId: string;
    displayName: string;
    username: string;
    role: string;
    area: string | null;
  };
  events: JourneyHistoryEvent[];
}

interface JourneyStatsResponse {
  ok: boolean;
  day: string;
  scope: 'self' | 'team' | 'all';
  viewer: {
    userId: string;
    displayName: string;
    username: string;
    role: string;
    area: string | null;
  };
  filters: {
    role: string | null;
    area: string | null;
  };
  totals: {
    attendanceScans: number;
    reusableDeliveries: number;
    reusableRedemptions: number;
    birthdayRedemptions: number;
    rouletteDeliveries: number;
    customQrRedemptions: number;
    totalActions: number;
  };
  me: JourneyOperatorStats;
  operators?: JourneyOperatorStats[];
}


function getRatingOption(val: Rating) {
  return RATING_OPTIONS.find(r => r.value === val) || RATING_OPTIONS[1];
}

function formatTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
}

function toLimaDateStr(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}


function shiftDay(dayStr: string, delta: number): string {
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return toLimaDateStr(d);
}

const JOURNEY_ROLE_OPTIONS = ['ALL', 'COLLAB', 'STAFF', 'COORDINATOR', 'ADMIN'] as const;

function classifyReusableSourceForJourney(groupName: string | null | undefined) {
  const normalizedGroup = (groupName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalizedGroup.includes('barra')) {
    return { key: 'bar', label: 'Barra' };
  }
  if (normalizedGroup.includes('roll') || normalizedGroup.includes('banner')) {
    return { key: 'roll-banner', label: 'Roll Banner' };
  }
  if (normalizedGroup.includes('domingo')) {
    return { key: 'domingo', label: 'Tokens Domingo' };
  }
  return { key: 'printed-card', label: 'Carta impresa' };
}

export default function DailyEvaluationPage() {
  const [selectedDay, setSelectedDay] = useState('');
  const [todayBusinessDay, setTodayBusinessDay] = useState('');
  const requestVersion = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userArea, setUserArea] = useState<string>('');
  const [modalGroup, setModalGroup] = useState<ReusableGroup | null>(null);

  // Data for selected day
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [evaluation, setEvaluation] = useState<DailyEvaluation | null>(null);
  const [dayBrief, setDayBrief] = useState<{ title?: string | null; show?: string | null; promos?: string | null; notes?: string | null } | null>(null);
  const [journeyStats, setJourneyStats] = useState<JourneyStatsResponse | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyRoleFilter, setJourneyRoleFilter] = useState<string>('ALL');
  const [journeyAreaFilter, setJourneyAreaFilter] = useState<string>('ALL');
  const [journeyHistory, setJourneyHistory] = useState<JourneyHistoryResponse | null>(null);
  const [journeyHistoryLoading, setJourneyHistoryLoading] = useState(false);
  const [journeyHistoryError, setJourneyHistoryError] = useState<string | null>(null);

  // Fetch user role once
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.role) setUserRole(d.role);
        if (d?.area) setUserArea(d.area);
      })
      .catch(() => {});
  }, []);

  // Form state
  const [evalRating, setEvalRating] = useState<Rating>('REGULAR');
  const [evalComment, setEvalComment] = useState('');
  const [personRatingsMap, setPersonRatingsMap] = useState<Map<string, { rating: Rating; note: string }>>(new Map());
  const [savingRatings, setSavingRatings] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [ratingsMsg, setRatingsMsg] = useState('');
  const [closeMsg, setCloseMsg] = useState('');
  const [ratingsModalOpen, setRatingsModalOpen] = useState(false);

  // Initialize to today's business day
  useEffect(() => {
    fetch('/api/admin/daily-evaluation?configuration=1').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { setTodayBusinessDay(data.currentBusinessDay); setSelectedDay(data.currentBusinessDay); }).catch(() => { setLoadError('No se pudo obtener la fecha de la jornada.'); setLoading(false); });
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedDay) return;
    const version = ++requestVersion.current;
    setLoadError('');
    setLoading(true);
    setSummary(null);
    setEvaluation(null);
    setDayBrief(null);
    setEvalRating('REGULAR');
    setEvalComment('');
    setPersonRatingsMap(new Map());
    try {
      const [summaryRes, evalRes, ratingsRes, briefRes] = await Promise.all([
        fetch(`/api/admin/daily-evaluation/summary?day=${selectedDay}`),
        fetch(`/api/admin/daily-evaluation?day=${selectedDay}`),
        fetch(`/api/admin/daily-evaluation/ratings?day=${selectedDay}`),
        fetch(`/api/admin/day-brief?day=${selectedDay}`),
      ]);

      if (version !== requestVersion.current) return;
      if (!summaryRes.ok || !evalRes.ok || !ratingsRes.ok) throw new Error('No se pudieron cargar los datos de la jornada.');
      if (summaryRes.ok) { const data = await summaryRes.json(); if (version !== requestVersion.current) return; setSummary(data); }
      let loadedEvaluation: DailyEvaluation | null = null;
      if (evalRes.ok) {
        const evalData = await evalRes.json();
        if (version !== requestVersion.current) return;
        loadedEvaluation = evalData.evaluation || null;
        if (evalData.evaluation) {
          setEvaluation(evalData.evaluation);
          setEvalRating(evalData.evaluation.rating || 'REGULAR');
          setEvalComment(evalData.evaluation.comment || '');
        }
      }
      if (ratingsRes.ok) {
        const rData = await ratingsRes.json();
        if (version !== requestVersion.current) return;
        const map = new Map<string, { rating: Rating; note: string }>();
        for (const r of (rData.ratings || []) as PersonRating[]) {
          map.set(r.personId, { rating: r.rating as Rating, note: r.note || '' });
        }
        setPersonRatingsMap(map);
      }
      if (briefRes.ok) {
        const bData = await briefRes.json();
        if (version !== requestVersion.current) return;
        if (bData.brief) setDayBrief(bData.brief);
      }
    } catch (err) {
      console.error('Error loading daily evaluation data:', err);
      if (version === requestVersion.current) setLoadError('No se pudieron cargar los datos de la jornada. Inténtalo de nuevo.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    void fetchData();
    return () => { requestVersion.current++; };
  }, [fetchData]);

  const fetchJourneyStats = useCallback(async () => {
    if (!selectedDay) return;
    setJourneyLoading(true);
    try {
      const params = new URLSearchParams({ day: selectedDay });
      if (userRole === 'ADMIN' && journeyRoleFilter !== 'ALL') {
        params.set('role', journeyRoleFilter);
      }
      if (userRole === 'ADMIN' && journeyAreaFilter !== 'ALL') {
        params.set('area', journeyAreaFilter);
      }

      const res = await fetch(`/api/user/journey/stats?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setJourneyStats(data as JourneyStatsResponse);
      } else {
        setJourneyStats(null);
      }
    } catch (err) {
      console.error('Error loading journey stats:', err);
      setJourneyStats(null);
    } finally {
      setJourneyLoading(false);
    }
  }, [selectedDay, userRole, journeyRoleFilter, journeyAreaFilter]);

  useEffect(() => {
    fetchJourneyStats();
  }, [fetchJourneyStats]);

  const openJourneyHistory = useCallback(async (userId: string, category: 'reusable' | 'birthday' | 'roulette') => {
    setModalSection('journey-history');
    setJourneyHistory(null);
    setJourneyHistoryError(null);
    setJourneyHistoryLoading(true);
    try {
      const params = new URLSearchParams({ day: selectedDay, userId, category });
      const res = await fetch(`/api/user/journey/stats/history?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setJourneyHistory(data as JourneyHistoryResponse);
      } else {
        setJourneyHistoryError(data?.message || data?.code || 'No se pudo cargar el historial.');
      }
    } catch (error) {
      setJourneyHistoryError('No se pudo cargar el historial.');
    } finally {
      setJourneyHistoryLoading(false);
    }
  }, [selectedDay]);

  // Initialize person ratings from attendance when summary loads
  useEffect(() => {
    if (!summary) return;
    setPersonRatingsMap(prev => {
      const next = new Map(prev);
      for (const a of summary.attendance) {
        if (!next.has(a.person.id)) {
          next.set(a.person.id, { rating: 'REGULAR', note: '' });
        }
      }
      return next;
    });
  }, [summary]);

  const handleCloseDay = async (action: 'close' | 'reopen') => {
    if (action === 'close') {
      setRatingsMsg('');
      // REGULAR es la calificacion inicial real, no solo un valor visual del modal.
      setPersonRatingsMap(prev => {
        const next = new Map<string, { rating: Rating; note: string }>();
        for (const entry of summary?.attendance || []) {
          next.set(entry.person.id, prev.get(entry.person.id) || { rating: 'REGULAR', note: '' });
        }
        return next;
      });
      setRatingsModalOpen(true);
      return;
    }

    setClosingDay(true);
    setCloseMsg('');
    try {
      const res = await fetch('/api/admin/daily-evaluation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDay: selectedDay, action }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluation(data.evaluation);
        setCloseMsg('Jornada reabierta');
      } else {
        const err = await res.json();
        setCloseMsg(err.error || 'Error');
      }
    } catch {
      setCloseMsg('Error de conexión');
    } finally {
      setClosingDay(false);
      setTimeout(() => setCloseMsg(''), 3000);
    }
  };

  const handleConfirmClose = async () => {
    setClosingDay(true);
    setSavingRatings(true);
    setRatingsMsg('');

    const ratings = (summary?.attendance || []).filter((entry) => entry.evaluable).map((entry) => {
      const data = personRatingsMap.get(entry.person.id) || { rating: 'REGULAR' as Rating, note: '' };
      return {
        personId: entry.person.id,
        rating: data.rating,
        note: data.note || undefined,
      };
    });

    try {
      const closeRes = await fetch('/api/admin/daily-evaluation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDay: selectedDay, action: 'close', rating: evalRating, comment: evalComment, ratings }),
      });
      const data = await closeRes.json();
      if (!closeRes.ok) {
        const err = data;
        setRatingsMsg(err.error || 'No se pudieron guardar las calificaciones.');
        return;
      }

      setEvaluation(data.evaluation);
      setRatingsModalOpen(false);
      void fetchData();
      const adjustedCount = Array.isArray(data.adjustedWorkers) ? data.adjustedWorkers.length : 0;
      setCloseMsg(
        adjustedCount > 0
          ? `Jornada cerrada. ${adjustedCount} calificación(es) ajustada(s) por falta de salida.`
          : 'Jornada cerrada'
      );
    } catch {
      setRatingsMsg('Error de conexión. Comprueba el estado de la jornada antes de reintentar.');
    } finally {
      setSavingRatings(false);
      setClosingDay(false);
    }
  };

  const updatePersonRating = (personId: string, field: 'rating' | 'note', value: string) => {
    setPersonRatingsMap(prev => {
      const next = new Map(prev);
      const existing = next.get(personId) || { rating: 'REGULAR' as Rating, note: '' };
      if (field === 'rating') {
        next.set(personId, { ...existing, rating: value as Rating });
      } else {
        next.set(personId, { ...existing, note: value });
      }
      return next;
    });
  };

  const isToday = selectedDay === todayBusinessDay;
  const isFutureDay = selectedDay > todayBusinessDay;
  const isClosed = !!evaluation?.closedAt;
  const canManage = ['ADMIN', 'COORDINATOR'].includes(userRole);
  const canClose = ['ADMIN', 'COORDINATOR'].includes(userRole);
  const isMultimedia = userArea.toUpperCase() === 'MULTIMEDIA';
  const isSecurity = userArea.toUpperCase() === 'SEGURIDAD';

  // Modal detail sections state
  const [modalSection, setModalSection] = useState<string | null>(null);

  // QR's Disponibles section (reusable)
  const qrSection = summary && summary.reusableGroups && summary.reusableGroups.length > 0 ? (
    <>
      <div className="relative flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
          🔄 QR&apos;s Disponibles
        </span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {summary.reusableGroups.map(g => (
            <button
              key={g.id}
              onClick={() => setModalGroup(g)}
              className="relative rounded-xl border p-3 sm:p-4 text-left transition-all hover:shadow-md border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-teal-300 dark:hover:border-teal-600"
            >
              <div className="flex items-center gap-1.5 mb-1">
                {g.color && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                )}
                <span className="text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{g.name}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{g.daySales}</div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Utilizados</div>
              {g.totalTokens > 0 && (
                <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">{g.totalTokens} tokens en grupo</div>
              )}
            </button>
        ))}
      </div>
    </>
  ) : null;

  // Special Guests section (reusable)
  const specialGuestsSection = summary ? (
    <>
      <div className="relative flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-violet-200 dark:bg-violet-700" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
          🎟️ Invitados Especiales
        </span>
        <div className="flex-1 h-px bg-violet-200 dark:bg-violet-700" />
      </div>

      <button
        onClick={() => setModalSection('guests')}
        className="w-full relative rounded-xl border p-3 sm:p-4 text-left transition-all hover:shadow-md border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-violet-300 dark:hover:border-violet-600"
      >
        <div className="flex items-center gap-3">
          <div className="text-xl sm:text-2xl">🎟️</div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{summary.specialGuests?.total ?? 0}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">Invitados</div>
          </div>
          {summary.specialGuests && summary.specialGuests.total > 0 && (
            <div className="ml-auto text-[10px] text-violet-600 dark:text-violet-400">{summary.specialGuests.arrived} llegaron</div>
          )}
        </div>
      </button>

      {summary.specialGuests && summary.specialGuests.total > 0 && (
        <button
          onClick={() => setModalSection('guests')}
          className="w-full relative rounded-xl border p-3 sm:p-4 text-left transition-all hover:shadow-md border-violet-200 dark:border-violet-700 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 hover:shadow-violet-100 dark:hover:shadow-none"
        >
          <div className="flex items-center gap-3">
            <div className="text-xl sm:text-2xl">✅</div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-violet-800 dark:text-violet-200">{summary.specialGuests.arrived}/{summary.specialGuests.total}</div>
              <div className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 font-medium">Invitados llegaron</div>
            </div>
          </div>
        </button>
      )}

      {modalSection === 'guests' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                🎟️ Invitados Especiales — {summary.specialGuests?.total ?? 0}
              </h3>
              <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span className="text-lg text-slate-400">&times;</span>
              </button>
            </div>
            {summary.specialGuests && summary.specialGuests.total > 0 && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {summary.specialGuests.arrived} llegaron
              </div>
            )}
            {!summary.specialGuests || summary.specialGuests.total === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No hay invitados especiales para este día.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {summary.specialGuests.events.map(ev => (
                  <div key={ev.id} className="text-[10px] sm:text-xs font-medium text-violet-700 dark:text-violet-300 px-1">
                    {ev.name} ({ev.timeSlot}) — {ev.arrivedGuests}/{ev.totalGuests}
                  </div>
                ))}
                {summary.specialGuests.guests.map(g => (
                  <div key={g.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/10">
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex-shrink-0 w-10 text-center">{g.eventTime}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{g.guestName}</div>
                      <div className="text-[10px] text-slate-500">{g.eventName}{g.guestCategory ? ` · ${g.guestCategory}` : ''}</div>
                    </div>
                    <div className="flex-shrink-0">
                      {g.status === 'arrived' ? (
                        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">✅ {formatTime(g.arrivedAt)}</span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">⏳</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  ) : null;

  // Birthdays section (reusable to avoid duplication)
  const birthdaysSection = summary ? (
    <>
      <div className="relative flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-pink-200 dark:bg-pink-700" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-pink-700 dark:text-pink-400 uppercase tracking-wider">
          🎂 Cumpleaños
        </span>
        <div className="flex-1 h-px bg-pink-200 dark:bg-pink-700" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setModalSection('birthdays')} className="rounded-xl border border-pink-200 bg-pink-50 p-2.5 text-left hover:shadow-md dark:border-pink-700 dark:bg-pink-900/10 sm:p-4">
          <div className="text-xl font-bold text-pink-800 dark:text-pink-200 sm:text-3xl">{summary.birthdays.approvedTotal}</div>
          <div className="mt-1 text-[10px] font-medium text-pink-700 dark:text-pink-400 sm:text-xs">Reservas aprobadas</div>
        </button>
        <button onClick={() => setModalSection('birthdays')} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-left hover:shadow-md dark:border-emerald-700 dark:bg-emerald-900/10 sm:p-4">
          <div className="text-xl font-bold text-emerald-800 dark:text-emerald-200 sm:text-3xl">{summary.birthdays.approvedArrived}<span className="text-sm font-medium opacity-70 sm:text-xl">/{summary.birthdays.approvedTotal}</span></div>
          <div className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 sm:text-xs">Cumpleañeros que llegaron</div>
        </button>
        <button onClick={() => setModalSection('birthdays')} className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-left hover:shadow-md dark:border-sky-700 dark:bg-sky-900/10 sm:p-4">
          <div className="text-xl font-bold text-sky-800 dark:text-sky-200 sm:text-3xl">{summary.birthdays.approvedGuestArrivals}<span className="text-sm font-medium opacity-70 sm:text-xl">/{summary.birthdays.approvedGuests}</span></div>
          <div className="mt-1 text-[10px] font-medium text-sky-700 dark:text-sky-400 sm:text-xs">Invitados que llegaron</div>
        </button>
      </div>
      {summary.birthdays.pendingReview > 0 && <button onClick={() => setModalSection('birthdays')} className="text-left text-xs font-medium text-amber-700 dark:text-amber-400">⏳ {summary.birthdays.pendingReview} reserva{summary.birthdays.pendingReview !== 1 ? 's' : ''} pendiente{summary.birthdays.pendingReview !== 1 ? 's' : ''} de revisión</button>}

      {modalSection === 'birthdays' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
              <div className="w-full max-w-sm rounded-2xl border border-pink-200 dark:border-pink-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    🎂 Cumpleaños — {summary.birthdays.approvedTotal} aprobadas
                  </h3>
              <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <span className="text-lg text-slate-400">&times;</span>
              </button>
            </div>
            {summary.birthdays && summary.birthdays.total > 0 && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {summary.birthdays.approvedArrived}/{summary.birthdays.approvedTotal} cumpleañeros llegaron · {summary.birthdays.approvedGuestArrivals}/{summary.birthdays.approvedGuests} invitados
              </div>
            )}
            {summary.birthdays.packs.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{summary.birthdays.packs.map(pack => <span key={pack.name} className="rounded-full bg-pink-100 px-2 py-1 text-[10px] font-medium text-pink-800 dark:bg-pink-900/30 dark:text-pink-200">{pack.name}: {pack.count}</span>)}</div>}
            {!summary.birthdays || summary.birthdays.total === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No hay reservas de cumpleaños para este día.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
                {summary.birthdays.reservations.map(r => (
                  <div key={r.id} className="rounded-lg bg-pink-50 dark:bg-pink-900/10 p-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words leading-snug">
                          {r.celebrantName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="rounded-full bg-white/70 px-2 py-0.5 dark:bg-slate-800">Hora prevista: {r.timeSlot}</span>
                          <span className="rounded-full bg-white/70 px-2 py-0.5 font-medium dark:bg-slate-800">{r.status === 'pending_review' ? 'Pendiente de revisión' : r.status === 'approved' ? 'Aprobada' : r.status === 'completed' ? 'Completada' : r.status === 'draft' ? 'Borrador' : r.status}</span>
                          {r.packName && <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800 px-2 py-0.5">{r.packName}</span>}
                          <span className={`rounded-full px-2 py-0.5 font-medium ${r.wantsPhotoSession ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                            Set fotográfico: {r.wantsPhotoSession ? 'Sí' : 'No'}
                          </span>
                          <span className="rounded-full bg-white/70 dark:bg-slate-800 px-2 py-0.5 text-slate-500 dark:text-slate-400">
                            {r.guestArrivals}/{r.guestsPlanned} invitados
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {r.hostArrived ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Llegó</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Sin llegada</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  ) : null;

  const journeySection = journeyStats ? (
    <>
      <div className="relative flex items-center gap-3 pt-2">
        <div className="flex-1 h-px bg-teal-200 dark:bg-teal-700" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
          TOKENS DISPONIBLES
        </span>
        <div className="flex-1 h-px bg-teal-200 dark:bg-teal-700" />
      </div>

      {journeyLoading ? (
        <div className="py-3 text-sm text-teal-700 dark:text-teal-300">Cargando colaboradores con actividad reusable...</div>
      ) : journeyStats.scope === 'self' ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {journeyStats.me.reusableGroups.length ? (
              journeyStats.me.reusableGroups.map((group) => {
                return (
                  <button
                    key={group.id}
                    onClick={() => setModalSection('journey-sources')}
                    className="relative rounded-xl border p-3 text-left transition-all hover:shadow-md border-slate-200 dark:border-slate-700 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/10 dark:to-cyan-900/10 hover:border-teal-300 dark:hover:border-teal-600"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {group.color && (
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      )}
                      <span className="text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {group.name}
                      </span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{group.total}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {group.deliveries} entregas · {group.redemptions} usos
                    </div>
                  </button>
                );
              })
            ) : null}
            <button
              type="button"
              onClick={() => openJourneyHistory(journeyStats.viewer.userId, 'roulette')}
              className="relative rounded-xl border p-3 text-left transition-all hover:shadow-md border-fuchsia-200 dark:border-fuchsia-800 bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-900/10 dark:to-pink-900/10 hover:border-fuchsia-300 dark:hover:border-fuchsia-600"
            >
              <div className="text-[10px] sm:text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300 mb-1">Ruleta /r</div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{journeyStats.me.rouletteDeliveries}</div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">entregas</div>
            </button>
          </div>

          {modalSection === 'journey-sources' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
              <div className="w-full max-w-sm rounded-2xl border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Fuentes de canje</h3>
                  <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <span className="text-lg text-slate-400">&times;</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {journeyStats.me.reusableGroups.map((group) => (
                    <div key={group.id || group.name} className="flex items-center justify-between rounded-lg bg-teal-50 dark:bg-teal-900/10 px-3 py-2">
                      <span className="text-sm text-slate-800 dark:text-slate-200">{group.name}</span>
                      <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">{group.total}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/10 px-3 py-2">
                    <span className="text-sm text-slate-800 dark:text-slate-200">Ruleta /r</span>
                    <span className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">{journeyStats.me.rouletteDeliveries}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-200">Colaboradores con escaneo de tokens del local</h3>
              <p className="text-xs text-teal-700 dark:text-teal-300">Se muestran colaboradores con actividad de reusables, ruleta /r o tokens de cumpleanos en {journeyStats.day}.</p>
            </div>

            {userRole === 'ADMIN' && (
              <div className="flex flex-wrap gap-2">
                <select
                  value={journeyRoleFilter}
                  onChange={(e) => setJourneyRoleFilter(e.target.value)}
                  className="rounded-lg border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  {JOURNEY_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role === 'ALL' ? 'Todos los roles' : role}
                    </option>
                  ))}
                </select>
                <select
                  value={journeyAreaFilter}
                  onChange={(e) => setJourneyAreaFilter(e.target.value)}
                  className="rounded-lg border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="ALL">Todas las areas</option>
                  {ALLOWED_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800">
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-teal-50 dark:bg-slate-900">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-teal-700 dark:text-teal-300">
                    <th className="px-3 py-2">Colaborador</th>
                    <th className="px-3 py-2">Area</th>
                    <th className="px-3 py-2 text-center">Reusables</th>
                    <th className="px-3 py-2 text-center">Ruleta /r</th>
                    <th className="px-3 py-2 text-center">Cumpleanos</th>
                  </tr>
                </thead>
                <tbody>
                  {journeyStats.operators?.length ? (
                    journeyStats.operators.map((row) => {
                      const isMe = row.userId === journeyStats.viewer.userId;
                      return (
                        <tr key={row.userId} className={`border-t border-teal-100 dark:border-teal-800 ${isMe ? 'bg-teal-50/70 dark:bg-teal-900/20' : ''}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{row.displayName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.role}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.area || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openJourneyHistory(row.userId, 'reusable')}
                              className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 font-semibold text-teal-700 transition-colors hover:bg-teal-100 hover:text-teal-900 dark:text-teal-300 dark:hover:bg-teal-900/30 dark:hover:text-teal-100"
                              title="Ver historial de tokens reutilizables"
                            >
                              {row.reusableDeliveries + row.reusableRedemptions}
                            </button>
                            {row.reusableGroups.length > 0 && (
                              <div className="mt-1 flex max-w-[13rem] flex-wrap justify-center gap-1">
                                {row.reusableGroups.map((group) => (
                                  <span
                                    key={group.id || group.name}
                                    className="inline-flex max-w-[8rem] items-center gap-1 truncate rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                                    title={`${group.name}: ${group.total}`}
                                  >
                                    {group.color && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: group.color }} />}
                                    <span className="truncate">{group.name}: {group.total}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openJourneyHistory(row.userId, 'roulette')}
                              className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100 hover:text-fuchsia-900 dark:text-fuchsia-300 dark:hover:bg-fuchsia-900/30 dark:hover:text-fuchsia-100"
                              title="Ver entregas de tokens de ruleta"
                            >
                              {row.rouletteDeliveries}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => openJourneyHistory(row.userId, 'birthday')}
                              className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 font-semibold text-pink-700 transition-colors hover:bg-pink-100 hover:text-pink-900 dark:text-pink-300 dark:hover:bg-pink-900/30 dark:hover:text-pink-100"
                              title="Ver historial de tokens de cumpleanos"
                            >
                              {row.birthdayRedemptions}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={5}>
                        Ningun colaborador registro actividad de tokens en este dia con los filtros actuales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {modalSection === 'journey-history' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
              <div className="w-full max-w-lg rounded-2xl border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {journeyHistory?.category === 'birthday' ? 'Historial de tokens de cumpleanos' : journeyHistory?.category === 'roulette' ? 'Historial de ruleta /r' : 'Historial de tokens reutilizables'}
                    </h3>
                    {journeyHistory?.operator && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{journeyHistory.operator.displayName} · {journeyHistory.day}</p>
                    )}
                  </div>
                  <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <span className="text-lg text-slate-400">&times;</span>
                  </button>
                </div>

                {journeyHistoryLoading ? (
                  <div className="py-6 text-sm text-slate-500 dark:text-slate-400">Cargando historial...</div>
                ) : journeyHistoryError ? (
                  <div className="py-6 text-sm text-rose-600 dark:text-rose-400">{journeyHistoryError}</div>
                ) : journeyHistory && journeyHistory.events.length > 0 ? (
                  <div className="max-h-80 overflow-auto space-y-2">
                    {journeyHistory.events.map((event) => (
                      <div key={event.id} className="rounded-lg bg-teal-50 dark:bg-teal-900/10 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{event.label}</div>
                            {event.groupName && <div className="text-[11px] text-slate-500 dark:text-slate-400">{event.groupName}</div>}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                            {journeyHistory?.category === 'birthday' ? (event.type === 'host' ? 'Cumpleanero' : 'Invitado') : journeyHistory?.category === 'roulette' ? 'Entrega /r' : (event.type === 'deliver' ? 'Entrega' : 'Canje')}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(event.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-sm text-slate-500 dark:text-slate-400">No hay eventos de {journeyHistory?.category === 'birthday' ? 'cumpleanos' : journeyHistory?.category === 'roulette' ? 'ruleta /r' : 'tokens reutilizables'} para este colaborador en el dia seleccionado.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  ) : null;
  return (
    <div className="space-y-4">
      {/* Header compacto con date picker inline */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
          {isToday ? '📋' : '📊'} Resumen
        </h1>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSelectedDay(shiftDay(selectedDay, -1))}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            &#8592;
          </button>
          <input
            type="date"
            value={selectedDay}
            onChange={(e) => e.target.value && setSelectedDay(e.target.value)}
            className="w-[130px] sm:w-[160px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setSelectedDay(shiftDay(selectedDay, 1))}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            &#8594;
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDay(todayBusinessDay)}
              className="px-2 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* Status badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{selectedDay}</span>
        {isClosed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-500">
            🔒 Cerrada
          </span>
        )}
        {evaluation?.rating && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getRatingOption(evaluation.rating as Rating).color}`}>
            {getRatingOption(evaluation.rating as Rating).emoji} {getRatingOption(evaluation.rating as Rating).label}
          </span>
        )}
      </div>

      {loadError && <div role="alert" className="p-3 text-sm text-red-600">{loadError}</div>}
        {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
          </div>
        </div>
      ) : loadError ? null : (
        <>
          {/* ====== BRIEF DEL DÍA (siempre primero) ====== */}
          {dayBrief && (dayBrief.title || dayBrief.show || dayBrief.promos || dayBrief.notes) && (
            <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-900/10 dark:to-sky-900/10 p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📝</span>
                <h3 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">Brief del Día</h3>
              </div>
              {dayBrief.title && (
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dayBrief.title}</p>
              )}
              {dayBrief.show && (
                <div>
                  <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">🎤 Shows / Eventos</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dayBrief.show.split(/\n|;|•/).filter(Boolean).map((s, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {dayBrief.promos && (
                <div>
                  <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">🏷️ Promos</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dayBrief.promos.split(/\n|;|•/).filter(Boolean).map((p, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200 dark:border-sky-700">
                        {p.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {dayBrief.notes && (
                <div>
                  <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">📋 Notas</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 whitespace-pre-line">{dayBrief.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ====== JORNADA QR ====== */}
          {journeySection}

          {/* ====== SECCIÓN: COLABORADORES (solo ADMIN/COORDINATOR) ====== */}
          {canManage && summary && (
            <>
              <div className="relative flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-blue-200 dark:bg-blue-700" />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                  👥 Colaboradores Presentes
                </span>
                <div className="flex-1 h-px bg-blue-200 dark:bg-blue-700" />
              </div>

              <button
                onClick={() => setModalSection('attendance')}
                className="w-full relative rounded-xl border p-3 sm:p-4 text-left transition-all hover:shadow-md border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600"
              >
                <div className="flex items-center gap-3">
                  <div className="text-xl sm:text-2xl">👥</div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{summary.attendance.length}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">Presentes</div>
                  </div>
                  {summary.attendance.filter(a => a.missingExit).length > 0 && (
                    <div className="ml-auto text-[10px] text-amber-600 dark:text-amber-400">{summary.attendance.filter(a => a.missingExit).length} sin salida</div>
                  )}
                </div>
              </button>

              {/* Attendance Modal */}
              {modalSection === 'attendance' && summary.attendance.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-md rounded-2xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        👥 Colaboradores — {summary.attendance.length} presentes
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {summary.attendance.map(a => (
                        <div key={a.person.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/10">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{a.person.name}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{a.person.area || '-'} · {formatTime(a.firstIn)} → {formatTime(a.lastOut)}</div>
                          </div>
                          <div className="flex-shrink-0">
                            {a.missingExit ? (
                              <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Sin salida</span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">OK</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== TOKENS ESTÁTICOS ====== */}
          {summary?.staticBatches?.interactive && (
            <>
              <div className="relative flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-indigo-200 dark:bg-indigo-700" />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                  🎟️ TOKENS INTERACTIVOS
                </span>
                <div className="flex-1 h-px bg-indigo-200 dark:bg-indigo-700" />
              </div>

              {summary.staticBatches.interactive.batchName && <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">{summary.staticBatches.interactive.batchName}</p>}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setModalSection('staticAvailable')} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-left transition-all hover:shadow-md dark:border-emerald-700 dark:bg-emerald-900/10 sm:p-4">
                  <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200 sm:text-3xl">{summary.staticBatches.interactive.available}</div>
                  <div className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 sm:text-xs">Disponibles</div>
                  <div className="mt-1 text-[9px] text-emerald-600 dark:text-emerald-400">Sin escanear</div>
                </button>
                <button onClick={() => setModalSection('staticCirculation')} className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-left transition-all hover:shadow-md dark:border-amber-700 dark:bg-amber-900/10 sm:p-4">
                  <div className="text-lg font-bold text-amber-800 dark:text-amber-200 sm:text-3xl">{summary.staticBatches.interactive.inCirculation}</div>
                  <div className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 sm:text-xs">En circulación</div>
                  <div className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">Escaneados, pendientes de entrega</div>
                </button>
                <button onClick={() => setModalSection('staticPrizes')} className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-left transition-all hover:shadow-md dark:border-indigo-700 dark:bg-indigo-900/10 sm:p-4">
                  <div className="text-lg font-bold text-indigo-800 dark:text-indigo-200 sm:text-3xl">{summary.staticBatches.interactive.deliveredToday}</div>
                  <div className="mt-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-400 sm:text-xs">Entregados en la jornada</div>
                  <div className="mt-1 text-[9px] text-indigo-600 dark:text-indigo-400">Durante la jornada seleccionada</div>
                </button>
              </div>

              <button onClick={() => setModalSection('staticRedeemed')} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <span>Avance del lote · entregados</span>
                  <span>{summary.staticBatches.interactive.redeemed}/{summary.staticBatches.interactive.total}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Avance de entregas del lote" aria-valuemin={0} aria-valuemax={summary.staticBatches.interactive.total} aria-valuenow={summary.staticBatches.interactive.redeemed}>
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${summary.staticBatches.interactive.total ? Math.min(100, summary.staticBatches.interactive.redeemed / summary.staticBatches.interactive.total * 100) : 0}%` }} />
                </div>
                {summary.staticBatches.interactive.unavailable > 0 && <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">No disponibles: {summary.staticBatches.interactive.unavailable} · Vencidos: {summary.staticBatches.interactive.expired} · Deshabilitados: {summary.staticBatches.interactive.disabled} · Próximamente: {summary.staticBatches.interactive.upcoming}</div>}
              </button>

              {/* Modal: premios disponibles */}
              {modalSection === 'staticAvailable' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🎟️ Disponibles — {summary.staticBatches.interactive.available}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Tokens sin escanear {isToday ? 'ahora' : 'al cierre de la jornada seleccionada'}</p>
                    {summary.staticBatches.interactive.availablePrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No quedan tokens disponibles.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto">
                        {summary.staticBatches.interactive.availablePrizes.map(p => (
                          <div key={p.label} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                              <span className="text-xs font-medium truncate">{p.label}</span>
                            </div>
                            <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300 flex-shrink-0 ml-2">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal: premios disponibles */}
              {modalSection === 'staticRedeemed' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🎟️ Canjeados del lote — {summary.staticBatches.interactive.redeemed}/{summary.staticBatches.interactive.total}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Premios entregados hasta {isToday ? 'ahora' : 'el cierre de la jornada seleccionada'}</p>
                    {summary.staticBatches.interactive.redeemedPrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Sin premios canjeados.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto">
                        {summary.staticBatches.interactive.redeemedPrizes.map(p => (
                          <div key={p.label} className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/10">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                              <span className="text-xs font-medium truncate">{p.label}</span>
                            </div>
                            <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300 flex-shrink-0 ml-2">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal: entregados hoy */}
              {modalSection === 'staticPrizes' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🎟️ Entregados en la jornada — {summary.staticBatches.interactive.deliveredToday}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    {summary.staticBatches.interactive.deliveredPrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isToday ? 'Sin entregas aún hoy.' : 'No se entregaron tokens estáticos este día.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                        {summary.staticBatches.interactive.deliveredPrizes.map(p => (
                          <div key={p.label} className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/10">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {p.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                                <span className="text-xs font-medium truncate">{p.label}</span>
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                Entregado por: {p.operators.map(operator => `${operator.name}${operator.count > 1 ? ` (${operator.count})` : ''}`).join(', ')}
                              </div>
                            </div>
                            <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300 flex-shrink-0 ml-2">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal: en circulación */}
              {modalSection === 'staticCirculation' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🔄 En circulación — {summary.staticBatches.interactive.inCirculation}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Escaneados y pendientes de entrega {isToday ? 'ahora' : 'al cierre de la jornada seleccionada'}</p>
                    {summary.staticBatches.interactive.circulationPrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Ningún token en circulación.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                        {summary.staticBatches.interactive.circulationPrizes.map(p => (
                          <div key={p.label} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                            <div className="flex items-center gap-2 min-w-0">
                              {p.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                              <span className="text-xs font-medium truncate">{p.label}</span>
                            </div>
                            <span className="font-bold text-xs text-amber-700 dark:text-amber-300 flex-shrink-0 ml-2">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== SECCIÓN: PULSERAS TOKENSHOW ====== */}
          {summary && (
            <>
              <div className="relative flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-700" />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  🎟️ PULSERAS TOKENSHOW
                </span>
                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-700" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setModalSection('dayPrizes')} className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-left hover:shadow-md dark:border-amber-700 dark:bg-amber-900/10 sm:p-4">
                  <div className="text-xl font-bold text-amber-800 dark:text-amber-200 sm:text-3xl">{summary.totalTokensInBatches}</div>
                  <div className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 sm:text-xs">Pulseras programadas</div>
                </button>
                <button onClick={() => setModalSection('braceletsPlayed')} className="rounded-xl border border-sky-200 bg-sky-50 p-2.5 text-left hover:shadow-md dark:border-sky-700 dark:bg-sky-900/10 sm:p-4">
                  <div className="text-xl font-bold text-sky-800 dark:text-sky-200 sm:text-3xl">{summary.totalPlayed}</div>
                  <div className="mt-1 text-[10px] font-medium text-sky-700 dark:text-sky-400 sm:text-xs">Dinámicas jugadas</div>
                </button>
                <button onClick={() => setModalSection('prizes')} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-left hover:shadow-md dark:border-emerald-700 dark:bg-emerald-900/10 sm:p-4">
                  <div className="text-xl font-bold text-emerald-800 dark:text-emerald-200 sm:text-3xl">{summary.totalDelivered}</div>
                  <div className="mt-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 sm:text-xs">Premios entregados</div>
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">{summary.dayPrizes.length} tipos de premios asignados · Jugadas y entregas durante la jornada</p>

              {/* Day Prizes Modal */}
              {modalSection === 'dayPrizes' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🎟️ Pulseras programadas — {summary.totalTokensInBatches}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      {summary.totalTokensInBatches} pulseras en lotes de la fecha seleccionada
                    </div>
                    {summary.programmedBatches.length > 0 && <div className="mb-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">{summary.programmedBatches.map(batch => <div key={batch.id} className="flex justify-between gap-2"><span>{batch.description || 'Lote sin nombre'}</span><span>{batch.count}</span></div>)}</div>}
                    {summary.programmedPrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No hay premios asignados a las pulseras de este día.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                        {summary.programmedPrizes.map(p => (
                          <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                            <span className="text-xs font-medium">🎁 {p.label}</span><span className="text-xs font-bold">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalSection === 'braceletsPlayed' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-sky-200 bg-white p-4 shadow-xl dark:border-sky-700 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Dinámicas jugadas — {summary.totalPlayed}</h3>
                      <button onClick={() => setModalSection(null)} className="rounded-lg p-1 text-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Cerrar">&times;</button>
                    </div>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Premios revelados durante la jornada. Pendientes {isToday ? 'ahora' : 'al cierre de la jornada'}.</p>
                    {summary.playedPrizes.length === 0 ? <p className="text-xs text-slate-500">No se registraron dinámicas jugadas.</p> : (
                      <div className="grid max-h-60 grid-cols-1 gap-1.5 overflow-y-auto">
                        {summary.playedPrizes.map(prize => <div key={prize.id} className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 p-2.5 dark:bg-sky-900/10"><div className="min-w-0"><div className="text-xs font-medium">{prize.label}</div><div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{prize.pending} pendiente{prize.pending !== 1 ? 's' : ''} de entrega</div></div><span className="text-xs font-bold text-sky-700 dark:text-sky-300">{prize.count}</span></div>)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Prizes Modal */}
              {modalSection === 'prizes' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalSection(null)}>
                  <div className="w-full max-w-sm rounded-2xl border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        🎁 Premios Entregados — {summary.totalDelivered}
                      </h3>
                      <button onClick={() => setModalSection(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <span className="text-lg text-slate-400">&times;</span>
                      </button>
                    </div>
                    {summary.deliveredPrizes.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{isToday ? 'Sin premios entregados aún.' : 'No se entregaron premios.'}</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                        {summary.deliveredPrizes.map(p => (
                          <div key={p.label} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium">{p.label}</div>
                              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Entregado por: {p.operators.map(operator => `${operator.name}${operator.count > 1 ? ` (${operator.count})` : ''}`).join(', ')}</div>
                            </div>
                            <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== CUMPLEAÑOS ====== */}
          {birthdaysSection}

          {/* ====== QR'S DISPONIBLES ====== */}
          {qrSection}

          {/* ====== INVITADOS ESPECIALES ====== */}
          {specialGuestsSection}

          {/* Modal for reusable group detail (shared) */}
          {modalGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalGroup(null)}>
              <div className="w-full max-w-sm rounded-2xl border border-teal-200 dark:border-teal-700 bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {modalGroup.color && (
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: modalGroup.color }} />
                    )}
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {modalGroup.name}
                    </h3>
                  </div>
                  <button onClick={() => setModalGroup(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <span className="text-lg text-slate-400">&times;</span>
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {modalGroup.daySales} utilizado{modalGroup.daySales !== 1 ? 's' : ''} · {modalGroup.totalTokens} tokens en grupo
                </div>
                <a href="/u/reusable-tokens" className="inline-flex items-center gap-1 px-3 py-1.5 mb-3 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors">
                  Ver QR&apos;s
                </a>
                {modalGroup.prizes.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sin premios configurados.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
                    {modalGroup.prizes.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/10">
                        <span className="text-xs font-medium">{p.label}</span>
                        <span className="font-bold text-xs text-teal-700 dark:text-teal-300">{p.daySales}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== CLOSE DAY SECTION ===== */}
          {canClose && !isFutureDay && (
          <>
          <div className="relative flex items-center gap-3 pt-3">
            <div className="flex-1 h-px bg-red-200 dark:bg-red-800" />
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
              🔒 Cierre de Jornada
            </span>
            <div className="flex-1 h-px bg-red-200 dark:bg-red-800" />
          </div>
          {!isClosed ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4 text-center space-y-2">
              <div className="text-2xl">🔓</div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Jornada Abierta</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Cierra la jornada cuando termine el día operativo.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleCloseDay('close')}
                  disabled={closingDay}
                  className="px-5 py-2 rounded-lg bg-red-600 text-white font-medium text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {closingDay ? 'Cerrando...' : '🔒 Cerrar Jornada'}
                </button>
              </div>
              {closeMsg && (
                <p className={`text-sm font-medium ${closeMsg.includes('Error') || closeMsg.includes('Solo') ? 'text-red-600' : 'text-green-600'}`}>
                  {closeMsg}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Closed status — no reopen from /u, only from /admin */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center space-y-1">
                <div className="text-2xl">🔒</div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Jornada Cerrada</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cerrada el {new Date(evaluation!.closedAt!).toLocaleString('es-PE')}
                  {evaluation?.closedByName && <> por <span className="font-medium text-slate-700 dark:text-slate-300">{evaluation.closedByName}</span></>}
                </p>
                {evaluation?.rating && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Evaluación: <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getRatingOption(evaluation.rating as Rating).color}`}>
                      {getRatingOption(evaluation.rating as Rating).emoji} {getRatingOption(evaluation.rating as Rating).label}
                    </span>
                    {evaluation.evaluatedByName && <> por {evaluation.evaluatedByName}</>}
                  </p>
                )}
                {evaluation?.comment && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic mt-1">&ldquo;{evaluation.comment}&rdquo;</p>
                )}
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Solo un administrador puede reabrir la jornada.</p>
              </div>

          </>
          )}

          <CloseDayModal
            open={ratingsModalOpen && !!summary}
            attendance={(summary?.attendance || []).filter((entry) => entry.evaluable)}
            ratingOptions={RATING_OPTIONS}
            generalRating={evalRating}
            generalComment={evalComment}
            personRatings={personRatingsMap}
            saving={closingDay || savingRatings}
            error={ratingsMsg}
            onClose={() => setRatingsModalOpen(false)}
            onGeneralRatingChange={setEvalRating}
            onGeneralCommentChange={setEvalComment}
            onPersonRatingChange={(personId, rating) => updatePersonRating(personId, 'rating', rating)}
            onPersonNoteChange={(personId, note) => updatePersonRating(personId, 'note', note)}
            onQuickComment={(text) => setEvalComment((current) => current.trim() ? `${current.trim()} ${text}` : text)}
            onSubmit={handleConfirmClose}
          />
        </>
      )}
        </>
      )}
    </div>
  );
}
