"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { IconEdit, IconEye, IconPlus, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import { AttractSettings } from "@/components/welcomeplayers/AttractSettings";
import { MessageSettings } from "@/components/welcomeplayers/MessageSettings";
import { WELCOME_PLAYERS_STATS_REFRESH_MS } from "@/lib/welcomeplayers/config";

type Prize = {
  id: string;
  label: string;
  description: string | null;
  color: string;
  status: "active" | "inactive";
  weight: number;
  order: number;
  createdAt: string;
  updatedAt: string;
};

type PrizeForm = {
  label: string;
};

type DeliveredSpin = {
  spinId: string;
  label: string;
  createdAt: string;
};

const PRIZES_PER_PAGE = 4;

const EMPTY_FORM: PrizeForm = {
  label: "",
};

export default function WelcomePlayersCoordinatorClient() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [stats, setStats] = useState<{ businessDay: string; totalSpins: number; activePrizes: number; recentSpins?: DeliveredSpin[] } | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [prizePage, setPrizePage] = useState(1);
  const loadVersion = useRef(0);
  const [showDeliveredModal, setShowDeliveredModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prizesError, setPrizesError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<PrizeForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const prizeInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async (day = selectedDay) => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [configRes, statsRes] = await Promise.all([
        fetch("/api/admin/welcomeplayers/prizes", { cache: "no-store" }),
        fetch(`/api/welcomeplayers/stats${day ? `?day=${encodeURIComponent(day)}` : ""}`, { cache: "no-store" }).catch(() => null),
      ]);

      const configData = await configRes.json().catch(() => null);
      const statsData = statsRes ? await statsRes.json().catch(() => null) : null;
      if (version !== loadVersion.current) return;

      if (!configRes.ok || !configData?.ok) throw new Error(configData?.message || "No se pudieron cargar los premios.");
      if (configData?.ok) {
        setPrizes(Array.isArray(configData.prizes) ? configData.prizes : configData.data?.prizes || []);
        setPrizesError(null);
      }

      if (statsData?.ok) {
        setStats({
          businessDay: statsData.businessDay,
          totalSpins: statsData.totalSpins ?? 0,
          activePrizes: statsData.activePrizes ?? 0,
          recentSpins: Array.isArray(statsData.recentSpins) ? statsData.recentSpins : [],
        });
      } else setStats(null);
    } catch (err: any) {
      if (version === loadVersion.current) setPrizesError(err?.message || "No se pudo cargar la ruleta");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);
  useEffect(() => {
    if (selectedDay) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/welcomeplayers/stats", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok && data?.ok) setStats({ businessDay: data.businessDay, totalSpins: data.totalSpins, activePrizes: data.activePrizes, recentSpins: data.recentSpins || [] });
      } catch { /* Se mantiene el último dato disponible hasta la próxima consulta. */ }
    }, WELCOME_PLAYERS_STATS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedDay]);

  const sortedPrizes = useMemo(() => [...prizes].sort((a, b) => a.order - b.order), [prizes]);
  const configuredCount = sortedPrizes.length;
  const totalPrizePages = Math.max(1, Math.ceil(configuredCount / PRIZES_PER_PAGE));
  const currentPrizePage = Math.min(prizePage, totalPrizePages);
  useEffect(() => { setPrizePage((page) => Math.min(page, totalPrizePages)); }, [totalPrizePages]);
  const pageStart = (currentPrizePage - 1) * PRIZES_PER_PAGE;
  const visiblePrizes = sortedPrizes.slice(pageStart, pageStart + PRIZES_PER_PAGE);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setMessage(null);
  };

  const openDeliveredModal = () => setShowDeliveredModal(true);
  const closeDeliveredModal = () => setShowDeliveredModal(false);

  const resetRoulette = () => {
    if (!window.confirm("¿Reiniciar la ruleta? Esto borrará todos los premios configurados y dejará la sesión en blanco.")) {
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/welcomeplayers/prizes/reset", { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || "No se pudo reiniciar la ruleta");
        }

        setMessage("Ruleta reiniciada");
        resetForm();
        await loadAll();
      } catch (err: any) {
        setError(err?.message || "No se pudo reiniciar la ruleta");
      }
    });
  };

  const savePrize = () => {
    if (!form.label.trim()) {
      setError("El nombre del premio es requerido");
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const payload = {
          label: form.label.trim(),
        };

        const res = editingId
          ? await fetch(`/api/admin/welcomeplayers/prizes/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/admin/welcomeplayers/prizes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || "No se pudo guardar");
        }

        const successMessage = editingId ? "Premio actualizado" : "Premio creado";
        resetForm();
        setMessage(successMessage);
        await loadAll();
      } catch (err: any) {
        setError(err?.message || "No se pudo guardar");
      }
    });
  };

  const editPrize = (prize: Prize) => {
    setEditingId(prize.id);
    setForm({
      label: prize.label,
    });
    setMessage(null);
    setError(null);
    requestAnimationFrame(() => {
      prizeInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      prizeInputRef.current?.focus({ preventScroll: true });
    });
  };

  const deletePrize = (prize: Prize) => {
    if (!window.confirm(`¿Eliminar "${prize.label}"?`)) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/welcomeplayers/prizes/${prize.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || "No se pudo eliminar");
        }

        setMessage("Premio eliminado");
        await loadAll();
      } catch (err: any) {
        setError(err?.message || "No se pudo eliminar");
      }
    });
  };

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden px-0">
      <section className="w-full min-w-0 rounded-[28px] border border-white/10 bg-[#070A12] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-6">
        <div className="min-w-0"><h1 className="text-xl font-bold text-white sm:text-2xl">Ruleta Regalona</h1><p className="mt-1 text-sm text-slate-400">Gestiona los premios y la pantalla de bienvenida.</p></div>

      </section>

      <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="w-full min-w-0 rounded-[28px] border border-white/10 bg-[#090D17] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">{editingId ? "Editar premio" : "Nuevo premio"}</h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Cancelar edicion
              </button>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <Field label="Nombre del premio">
              <input
                ref={prizeInputRef}
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-fuchsia-400/60 focus:bg-white/10"
                placeholder="Ej. Shot gratis"
              />
            </Field>

          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={savePrize}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 via-rose-500 to-amber-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              <IconPlus className="h-4 w-4" />
              {editingId ? "Guardar cambios" : "Agregar premio"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>

          {(message || error) && (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                error ? "border-rose-500/20 bg-rose-500/10 text-rose-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {error || message}
            </div>
          )}

        </section>
        <section id="premios-configurados" className="w-full min-w-0 scroll-mt-4 rounded-[28px] border border-white/10 bg-[#090D17] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] sm:p-5">
          <h2 className="text-lg font-semibold text-white">Premios configurados</h2>
          <p className="mt-1 text-sm text-slate-400">Edita los premios que aparecen en la ruleta.</p>
          {loading ? <p className="mt-5 text-sm text-slate-400" role="status">Cargando premios…</p> : prizesError ? <p className="mt-5 text-sm text-rose-300" role="alert">{prizesError} <button type="button" className="underline" onClick={() => void loadAll()}>Reintentar</button></p> : sortedPrizes.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">Aún no hay premios configurados.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {visiblePrizes.map((prize) => (
                <article key={prize.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-1 h-4 w-4 shrink-0 rounded-full border border-white/15" style={{ backgroundColor: prize.color }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold text-white">{prize.label}</h3>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${prize.status === "active" ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-500/15 text-slate-300"}`}>{prize.status === "active" ? "Activo" : "Inactivo"}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 sm:justify-end">
                    <button type="button" disabled={pending} onClick={() => editPrize(prize)} aria-label={`Editar ${prize.label}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-medium text-white disabled:opacity-50 sm:flex-none"><IconEdit className="h-4 w-4" />Editar</button>
                    <button type="button" disabled={pending} onClick={() => deletePrize(prize)} aria-label={`Eliminar ${prize.label}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-200 disabled:opacity-50 sm:flex-none"><IconTrash className="h-4 w-4" />Eliminar</button>
                  </div>
                </article>
              ))}
              {totalPrizePages > 1 && (
                <nav aria-label="Páginas de premios" className="!mt-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-3">
                  <p className="mb-3 text-center text-sm font-semibold text-fuchsia-100" aria-live="polite">
                    Página {currentPrizePage} de {totalPrizePages} <span className="font-normal text-slate-300">· Premios {pageStart + 1}–{Math.min(pageStart + PRIZES_PER_PAGE, configuredCount)} de {configuredCount}</span>
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={currentPrizePage === 1} onClick={() => setPrizePage(currentPrizePage - 1)} className="min-h-11 flex-1 rounded-xl border border-white/20 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40">← Anterior</button>
                    <button type="button" disabled={currentPrizePage === totalPrizePages} onClick={() => setPrizePage(currentPrizePage + 1)} className="min-h-11 flex-1 rounded-xl bg-fuchsia-600 px-3 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:opacity-40">Siguiente →</button>
                  </div>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>

      <MessageSettings />
      <AttractSettings />
      <div className="flex w-full flex-wrap justify-center gap-2">
        <Link
          href="/welcomeplayers"
          className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          <IconEye className="h-4 w-4" />
          Ver ruleta
        </Link>
        <button
          type="button"
          onClick={resetRoulette}
          className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
        >
          <IconRefresh className="h-4 w-4" />
          Reiniciar ruleta
        </button>
      </div>

      <section aria-label="Resumen de la ruleta" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-sm font-semibold text-white">Resumen de la ruleta</h2><p className="mt-1 text-xs text-slate-400">Consulta los resultados de cada jornada.</p></div>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">Jornada<input type="date" value={selectedDay || stats?.businessDay || ""} onChange={(event) => { const day = event.target.value; setSelectedDay(day); setStats(null); void loadAll(day); }} className="mt-1 block min-h-11 max-w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white" /></label>
            {selectedDay && <button type="button" onClick={() => { setSelectedDay(""); setStats(null); void loadAll(""); }} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm text-white">Jornada actual</button>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-sm text-slate-300">
          <button type="button" onClick={openDeliveredModal} disabled={!stats} className="min-h-11 text-left transition hover:text-white disabled:opacity-60"><span className="font-semibold text-white">{stats?.totalSpins ?? "—"}</span> {stats?.totalSpins === 1 ? "giro" : "giros"} de la jornada <span className="ml-1 text-xs text-fuchsia-300">Ver resultados →</span></button>
          <span><span className="font-semibold text-white">{prizesError ? "—" : configuredCount}</span> {configuredCount === 1 ? "premio configurado" : "premios configurados"}</span>
        </div>
        {!loading && !stats && <p className="mt-2 text-sm text-amber-300">No se pudieron cargar los giros. <button type="button" className="underline" onClick={() => void loadAll()}>Reintentar</button></p>}
      </section>

      {showDeliveredModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6" onClick={closeDeliveredModal}>
          <div
            className="max-h-[85vh] w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[#070A12] shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">Premios obtenidos</h3>
                <p className="mt-1 text-xs text-slate-400">Últimos resultados de la jornada {stats?.businessDay || "seleccionada"}.</p>
              </div>
              <button
                type="button"
                onClick={closeDeliveredModal}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/10"
                aria-label="Cerrar"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(85vh-88px)] overflow-y-auto px-4 py-4 sm:px-5">
              {stats?.recentSpins?.length ? (
                <div className="space-y-3">
                  {stats.recentSpins.map((spin) => (
                    <article key={spin.spinId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">{spin.label}</div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {new Date(spin.createdAt).toLocaleString("es-PE", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                          Obtenido
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-slate-400">
                  No hay resultados en esta jornada.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}
