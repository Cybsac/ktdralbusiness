'use client';

import React, { useState, useEffect } from 'react';
import { IconUser, IconId, IconMapPin, IconShield, IconKey, IconCheck, IconX, IconChartBar } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { ROLE_CHOICES, USER_POLICY } from '@/lib/users/policy';
import { RATING_OPTIONS } from '@/lib/daily-evaluation-options';
import { RATING_LEVELS } from '@/lib/daily-evaluation';
import { ActivityMilestoneProgress, useActivityMilestones } from '@/components/activity-milestones/ActivityMilestoneProgress';

interface UserProfile {
  id: string;
  username: string;
  role: string;
  personCode: string | null;
  personName: string | null;
  area: string | null;
  dni: string | null;
}

interface PerformanceSummary {
  averageScore: number | null;
  level: 'MALO' | 'REGULAR' | 'BUENO' | 'MUY_BUENO' | null;
  evaluatedDays: number;
  start: string;
  end: string;
  distribution: Record<string, number>;
}

interface PerformanceData {
  week: PerformanceSummary;
  last30Days: PerformanceSummary;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | null;
}

export default function ProfileClient() {
  const router = useRouter();
  const milestones = useActivityMilestones('self');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [performanceError, setPerformanceError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    void loadPerformance(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadProfile(signal?: AbortSignal) {
    setLoading(true);
    setProfileError('');
    try {
      const response = await fetch('/api/user/me', { signal, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.user) throw new Error('No se pudo cargar el perfil.');
      setProfile(data.user);
    } catch {
      if (!signal?.aborted) setProfileError('No se pudo cargar el perfil. Inténtalo de nuevo.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function loadPerformance(signal?: AbortSignal) {
    setPerformanceLoading(true);
    setPerformanceError('');
    try {
      const response = await fetch('/api/user/me/performance', { signal, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error('No se pudo cargar el rendimiento.');
      setPerformance(data.performance);
    } catch {
      if (!signal?.aborted) setPerformanceError('No se pudo cargar el rendimiento.');
    } finally {
      if (!signal?.aborted) setPerformanceLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    if (newPassword.length < USER_POLICY.passwordMin || new TextEncoder().encode(newPassword).length > USER_POLICY.passwordMax) {
      setError(`La contraseña debe tener al menos ${USER_POLICY.passwordMin} caracteres y como máximo ${USER_POLICY.passwordMax} bytes`);
      return;
    }

    setChangingPassword(true);

    try {
      const response = await fetch('/api/user/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setMessage('Contraseña cambiada exitosamente');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        router.refresh();
      } else {
        setError(data.message || 'Error al cambiar la contraseña');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen sm:min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-sm sm:text-base text-slate-600 dark:text-slate-300">Cargando perfil...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-screen sm:min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div role="alert" className="space-y-2 text-center text-sm sm:text-base text-red-600 dark:text-red-400"><p>{profileError || 'No se pudo cargar el perfil.'}</p><button type="button" onClick={() => void loadProfile()} className="underline">Reintentar</button></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-4xl px-3 sm:px-6 lg:px-8 py-2 sm:py-6 lg:py-8">
        <div className="space-y-3 sm:space-y-6 lg:space-y-8">
          {/* Información Personal */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <IconUser className="w-4 sm:w-6 h-4 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-100">Información Personal</h2>
              </div>
            </div>

            <div className="p-3 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconUser className="w-3 sm:w-4 h-3 sm:h-4" />
                    Nombre
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium text-xs sm:text-base">
                    {profile.personName || 'No especificado'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconId className="w-3 sm:w-4 h-3 sm:h-4" />
                    Usuario
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium text-xs sm:text-base">
                    {profile.username}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconId className="w-3 sm:w-4 h-3 sm:h-4" />
                    DNI
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium text-xs sm:text-base">
                    {profile.dni || 'No especificado'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconMapPin className="w-3 sm:w-4 h-3 sm:h-4" />
                    Área
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium text-xs sm:text-base">
                    {profile.area || 'No especificado'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconShield className="w-3 sm:w-4 h-3 sm:h-4" />
                    Rol
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium text-xs sm:text-base">
                    {ROLE_CHOICES.find(role => role.id === profile.role)?.name || profile.role}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-400">
                    <IconId className="w-3 sm:w-4 h-3 sm:h-4" />
                    Código
                  </div>
                  <div className="text-gray-900 dark:text-slate-100 font-medium font-mono text-xs sm:text-base">
                    {profile.personCode || 'No especificado'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {milestones.loading ? <p className="text-xs text-slate-500">Cargando hitos de actividad…</p> : milestones.error ? <p role="status" className="text-xs text-amber-700 dark:text-amber-400">No se pudieron cargar los hitos. <button type="button" className="underline" onClick={() => void milestones.refresh()}>Reintentar</button></p> : milestones.users[0] && <ActivityMilestoneProgress progress={milestones.users[0]} />}

          {/* Rendimiento personal */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 overflow-hidden">
            <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-indigo-100 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1 sm:p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <IconChartBar className="w-4 sm:w-6 h-4 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-100">Mi Rendimiento</h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Basado en tus evaluaciones de jornadas cerradas</p>
                </div>
              </div>
            </div>
            <div className="p-3 sm:p-6">
              {performanceLoading ? (
                <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
              ) : performanceError ? (
                <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{performanceError} <button type="button" className="underline" onClick={() => void loadPerformance()}>Reintentar</button></p>
              ) : !performance ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay evaluaciones registradas.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <PerformanceMetric title="Esta semana" summary={performance.week} />
                  <PerformanceMetric title="Últimos 30 días" summary={performance.last30Days} />
                </div>
              )}
              {performance?.trend && (
                <div className="mt-4 text-xs text-slate-600 dark:text-slate-300">
                  Tendencia: <span className="font-semibold">{performance.trend === 'IMPROVING' ? 'Mejorando' : performance.trend === 'DECLINING' ? 'Bajando' : 'Estable'}</span>
                </div>
              )}
              {!performanceError && <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">Con pocas evaluaciones, interpreta el promedio con cautela.</p>}
            </div>
          </div>

          {/* Cambio de Contraseña */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-700">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1 sm:p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <IconKey className="w-4 sm:w-6 h-4 sm:h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-slate-100">Cambiar Contraseña</h2>
              </div>
            </div>

            <div className="p-3 sm:p-6">
              {message && (
                <div className="mb-2 sm:mb-6 p-2 sm:p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <IconCheck className="w-4 sm:w-5 h-4 sm:h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <p className="text-xs sm:text-sm text-green-800 dark:text-green-200">{message}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-2 sm:mb-6 p-2 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <IconX className="w-4 sm:w-5 h-4 sm:h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <p className="text-xs sm:text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-3 sm:space-y-6">
                <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                  <div className="sm:col-span-2">
                    <label htmlFor="currentPassword" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 sm:mb-2">
                      Contraseña Actual
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 transition-colors text-sm sm:text-base"
                      placeholder="Ingresa tu contraseña actual"
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 sm:mb-2">
                      Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={USER_POLICY.passwordMin}
                      className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 transition-colors text-sm sm:text-base"
                      placeholder={`Mínimo ${USER_POLICY.passwordMin} caracteres`}
                    />
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1 sm:mb-2">
                      Confirmar Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={USER_POLICY.passwordMin}
                      className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-100 transition-colors text-sm sm:text-base"
                      placeholder="Repite la nueva contraseña"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3 sm:pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="inline-flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 border border-transparent shadow-sm text-xs sm:text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {changingPassword ? (
                      <>
                        <div className="animate-spin rounded-full h-3 sm:h-4 w-3 sm:w-4 border-b-2 border-white mr-1 sm:mr-2"></div>
                        Cambiando...
                      </>
                    ) : (
                      <>
                        <IconKey className="w-3 sm:w-5 h-3 sm:h-5 mr-1 sm:mr-2" />
                        Cambiar Contraseña
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerformanceMetric({ title, summary }: { title: string; summary: PerformanceSummary }) {
  const level = RATING_OPTIONS.find(option => option.value === summary.level);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      {summary.averageScore === null ? (
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sin evaluaciones registradas</div>
      ) : (
        <>
          <div className={`mt-2 text-lg font-semibold ${level?.color || 'text-slate-700 dark:text-slate-200'}`}>
            {level?.emoji} {level?.label} · {summary.averageScore.toFixed(2)} / {RATING_LEVELS.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.evaluatedDays} {summary.evaluatedDays === 1 ? 'jornada evaluada' : 'jornadas evaluadas'}</div>
        </>
      )}
    </div>
  );
}
