"use client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";

import RetryContinuation from "@/components/roulette/RetryContinuation";
import RouletteHeading from "@/components/roulette/RouletteHeading";
import { rouletteQuality, type RouletteQuality } from "@/components/roulette/motion";
import { RouletteElement } from "@/components/roulette/types";
import { useRouletteSounds } from "@/hooks/useRouletteSounds";
import { getExperienceUi } from "@/lib/experiences/config";
import { ROULETTE_CONFIG } from "@/lib/experiences/roulette-config";
import { gamePrizeAccessPath } from "@/lib/prize-games/links";
import type { InitialGame } from "@/lib/prize-games/public-load";
import { perfCheckBudget, perfMark, perfMeasure, perfSummarize } from "@/lib/perf";
import {
  deliverGamePrize,
  GameRequestError,
  revealGameResult,
  type PrizeGameData,
} from "@/lib/prize-games/client";
import { GAME_RESULT_KEYS } from "@/lib/prize-games/contracts";
import type { ThemeName, ThemeConfig } from "@/lib/themes/types";
import { useRouletteTheme } from "@/lib/themes/useRouletteTheme";

import layoutStyles from "./rouletteLayout.module.css";

const ScratchCardExperience = dynamic(() => import("@/components/experiences/ScratchCardExperience"), { ssr: false });
const CanvasConfetti = dynamic(() => import("@/components/visual/CanvasConfetti"), { ssr: false });
const NewRoulette = dynamic(() => import("@/components/roulette/NewRoulette"));
const LoseModal = dynamic(() => import("@/components/roulette/LoseModal"));
const PrizeWinModal = dynamic(() => import("@/components/roulette/PrizeWinModal"));
const PrizeDeliveryAction = dynamic(() => import("@/components/prize-authorization/PrizeDeliveryAction").then(m => m.PrizeDeliveryAction));
const PrizeRedemptionQr = dynamic(() => import("@/components/roulette/PrizeRedemptionQr").then(m => m.PrizeRedemptionQr));

// Confetti ahora usando canvas para menos costo en DOM
const Confetti = ({
  active,
  lowMotion = false,
  colors,
  quality,
}: {
  active: boolean;
  lowMotion?: boolean;
  colors?: string[];
  quality?: RouletteQuality;
}) => active && !lowMotion ? <CanvasConfetti active lowMotion={lowMotion} colors={colors} maxParticles={quality ? ROULETTE_CONFIG.quality[quality].particles : undefined} pixelRatioCap={quality ? ROULETTE_CONFIG.quality[quality].pixelRatio : undefined} /> : null;

// Función helper para obtener clases CSS del tema
const getThemeClass = (themeConfig: ThemeConfig) => {
  return themeConfig?.global?.layout?.themeClass || "";
};

const spinCounterFormatter = new Intl.NumberFormat("en-US", {
  minimumIntegerDigits: 3,
  maximumFractionDigits: 0,
  useGrouping: true,
});

const GUIDE_SLOT_COUNT = ROULETTE_CONFIG.sidebar.visibleSlots;

interface RouletteSidebarInsight {
  id: string;
  icon: "spark" | "check" | "trophy" | "gift" | "clock" | "bolt" | "chart";
  title: string;
  value: string;
  detail: string;
  tone: "gold" | "emerald" | "amber";
  sortOrder: number;
}

function getVisibleGuideInsights(
  insights: RouletteSidebarInsight[],
  visibleCount: number,
  startIndex: number
) {
  if (insights.length === 0) return [];
  const total = Math.min(visibleCount, insights.length);
  return Array.from(
    { length: total },
    (_, index) => insights[(startIndex + index) % insights.length]
  );
}

function getPhaseUi(
  phase: "READY" | "SPINNING" | "REVEALED_MODAL" | "REVEALED_PANEL" | "DELIVERED"
) {
  if (phase === "SPINNING") {
    return { activeStep: 2 };
  }
  if (phase === "REVEALED_MODAL" || phase === "REVEALED_PANEL" || phase === "DELIVERED") {
    return { activeStep: 3 };
  }
  return { activeStep: 1 };
}

function GuideInsightIcon({ icon }: { icon: RouletteSidebarInsight["icon"] | "placeholder" }) {
  if (icon === "spark") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
        <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
        <path d="M5 14l.7 1.6L7.3 16l-1.6.7L5 18.3l-.7-1.6L2.7 16l1.6-.4L5 14Z" />
      </svg>
    );
  }
  if (icon === "check") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12.4 2.1 2.1 4.9-5.3" />
      </svg>
    );
  }
  if (icon === "trophy") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
        <path d="M10 14h4" />
        <path d="M9 18h6" />
        <path d="M12 11v3" />
        <path d="M8 6H6a2 2 0 1 0 0 4h2" />
        <path d="M16 6h2a2 2 0 1 1 0 4h-2" />
      </svg>
    );
  }
  if (icon === "gift") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M12 8v11" />
        <path d="M5 10h14" />
        <path d="M7 10h10v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9Z" />
        <path d="M6 6a2 2 0 0 1 3.4-1.4L12 7l2.6-2.4A2 2 0 1 1 18 7v3H6V6Z" />
      </svg>
    );
  }
  if (icon === "clock") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (icon === "bolt") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M13 2 6 13h5l-1 9 8-12h-5l1-8Z" />
      </svg>
    );
  }
  if (icon === "chart") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M4 19h16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8h.01" />
      <path d="M9 12h6" />
      <path d="M10 16h4" />
    </svg>
  );
}

interface RouletteClientPageProps {
  tokenId: string;
  initial: InitialGame;
  theme: ThemeName;
}

type Phase = "READY" | "SPINNING" | "REVEALED_MODAL" | "REVEALED_PANEL" | "DELIVERED";

export default function RouletteClientPage({ tokenId: activeTokenId, initial, theme }: RouletteClientPageProps) {
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const { config: themeConfig } = useRouletteTheme();
  const sounds = useRouletteSounds(initial.data?.token.experienceType === 'roulette' && !initial.data.token.revealedAt && !initial.data.token.disabled);
  const [error, setError] = useState<string | null>(initial.error?.message ?? null);
  const [errorCode, setErrorCode] = useState<string | null>(initial.error?.code ?? null);
  const [token, setToken] = useState<PrizeGameData["token"] | null>(initial.data?.token ?? null);
  const isScratchExperience = token?.experienceType === "scratch_card";
  const [elements] = useState<RouletteElement[]>(() => (initial.data?.elements ?? []).map((element, index) => ({
    label: element.label,
    color: element.color || themeConfig.roulette.segments.palette[index % themeConfig.roulette.segments.palette.length] || themeConfig.colors.accent,
    prizeId: element.prizeId,
    key: element.key,
  })));
  const initialResult = token?.revealedAt ? elements.findIndex(element => element.prizeId === token.prize.id) : -1;
  const initialContinuation = token?.revealedAt && token.action === "RETRY" && token.continuation?.state !== "UNAVAILABLE" ? token.continuation?.tokenId ?? null : null;
  const [functionalTokenId, setFunctionalTokenId] = useState<string | null>(initialContinuation);
  const [retryOverlayOpen, setRetryOverlayOpen] = useState(Boolean(initialContinuation));
  const [phase, setPhase] = useState<Phase>(() => token?.deliveredAt || token?.redeemedAt ? "DELIVERED" : token?.revealedAt && token.action !== "RETRY" && initialResult >= 0 ? token.action === "LOSE" ? "REVEALED_MODAL" : "REVEALED_PANEL" : "READY");
  const [prizeIndex, setPrizeIndex] = useState<number | null>(initialResult >= 0 ? initialResult : null);
  const [prizeWon, setPrizeWon] = useState<RouletteElement | null>(initialResult >= 0 ? elements[initialResult] : null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scratchLowMotion, setScratchLowMotion] = useState(false);
  const [quality, setQuality] = useState<RouletteQuality>(ROULETTE_CONFIG.defaultQuality);
  const lowMotion = isScratchExperience ? scratchLowMotion : reducedMotion;
  const prizeModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationSoundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealControllerRef = useRef<AbortController | null>(null);
  const scratchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [spinCounter, setSpinCounter] = useState<number | null>(null);
  const [guideInsights, setGuideInsights] = useState<RouletteSidebarInsight[]>([]);
  const [guideRotationIndex, setGuideRotationIndex] = useState(0);
  const experienceUi = getExperienceUi(token?.experienceType);
  const [mobileSliderIndex, setMobileSliderIndex] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.documentElement;
    const attrName = "data-roulette-theme";
    const prevValue = target.getAttribute(attrName);
    if (theme) {
      target.setAttribute(attrName, theme);
    } else {
      target.removeAttribute(attrName);
    }
    return () => {
      if (prevValue) {
        target.setAttribute(attrName, prevValue);
      } else {
        target.removeAttribute(attrName);
      }
    };
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      setReducedMotion(media.matches);
      const device = ROULETTE_CONFIG.device;
      setScratchLowMotion(media.matches || (!!memory && memory <= device.lowMemoryGB) || window.innerWidth < device.scratchSmallWidth || window.innerHeight < device.scratchSmallHeight);
      setQuality(rouletteQuality(memory, navigator.hardwareConcurrency, window.matchMedia(device.compactMedia).matches));
    };
    update();
    media.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => { media.removeEventListener?.('change', update); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    const update = () => {
      const quiet = lowMotion || (!isScratchExperience && quality !== 'high') || phase === 'SPINNING' || document.hidden;
      document.documentElement.toggleAttribute('data-roulette-quiet', quiet);
      if (!isScratchExperience) document.documentElement.dataset.rouletteQuality = quality;
      else delete document.documentElement.dataset.rouletteQuality;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { document.removeEventListener('visibilitychange', update); document.documentElement.removeAttribute('data-roulette-quiet'); delete document.documentElement.dataset.rouletteQuality; };
  }, [lowMotion, phase, quality, isScratchExperience]);

  const pauseRouletteExtras = phase !== 'READY' || retryOverlayOpen || Boolean(error) || Boolean(token?.disabled);

  // Los indicadores son informativos: no retrasan la carga del juego ni se actualizan en segundo plano.
  useEffect(() => {
    if (!initial.data || pauseRouletteExtras) return;
    let active = true;
    let inFlight: AbortController | null = null;
    const loadSummary = async () => {
      if (document.hidden || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timeout = window.setTimeout(() => controller.abort(), ROULETTE_CONFIG.sidebar.timeoutMs);
      try {
        const response = await fetch('/api/system/tokens/sidebar', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        const insights = Array.isArray(data?.summary?.insights) ? ([...data.summary.insights] as RouletteSidebarInsight[]).sort((a, b) => a.sortOrder - b.sortOrder) : [];
        setGuideInsights(insights);
        setGuideRotationIndex(current => insights.length ? current % insights.length : 0);
        if (typeof data?.metrics?.totalSpins === 'number') setSpinCounter(data.metrics.totalSpins);
      } catch { /* Los indicadores no impiden jugar. */ }
      finally { window.clearTimeout(timeout); if (inFlight === controller) inFlight = null; }
    };
    const onVisibility = () => { if (document.hidden) { inFlight?.abort(); inFlight = null; } else void loadSummary(); };
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => void loadSummary()) : undefined;
    const deferred = idle === undefined ? window.setTimeout(loadSummary, 0) : undefined;
    const timer = window.setInterval(loadSummary, ROULETTE_CONFIG.sidebar.refreshMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { active = false; inFlight?.abort(); if (idle !== undefined) window.cancelIdleCallback(idle); if (deferred !== undefined) window.clearTimeout(deferred); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [initial.data, pauseRouletteExtras]);

  useEffect(() => {
    if (pauseRouletteExtras) return;
    if (guideInsights.length <= GUIDE_SLOT_COUNT) {
      setGuideRotationIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) setGuideRotationIndex((current) => (current + 1) % guideInsights.length);
    }, ROULETTE_CONFIG.sidebar.desktopRotationMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [guideInsights.length, pauseRouletteExtras]);

  useEffect(() => {
    if (pauseRouletteExtras) return;
    const totalItems = guideInsights.length + (spinCounter != null ? 1 : 0);
    if (totalItems <= 1) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setMobileSliderIndex((prev) => (prev + 1) % totalItems);
    }, ROULETTE_CONFIG.sidebar.mobileRotationMs);
    return () => window.clearInterval(id);
  }, [guideInsights.length, spinCounter, pauseRouletteExtras]);

  useEffect(() => {
    perfMark("page_mount");
    const frame = requestAnimationFrame(() => {
      if (!initial.data) return;
      perfMark("game_ready");
      if (!performance.getEntriesByName('load_total').length) {
        performance.mark('load_start', { startTime: 0 });
        perfMeasure('load_total', 'load_start', 'game_ready');
        perfCheckBudget('load_total', ROULETTE_CONFIG.loadBudgetMs, 'load');
      }
      if (Math.random() < ROULETTE_CONFIG.perfSampleRate) perfSummarize();
    });
    return () => {
      cancelAnimationFrame(frame);
      const controller = revealControllerRef.current;
      revealControllerRef.current = null;
      controller?.abort();
    };
  }, [initial.data]);

  const handleSpin = async () => {
    if (phase !== "READY") return;
    if (!activeTokenId) return;
    if (token?.revealedAt || token?.redeemedAt || token?.deliveredAt) return;
    if (revealControllerRef.current) return;
    const controller = new AbortController();
    revealControllerRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), ROULETTE_CONFIG.requestTimeoutMs);
    setPhase("SPINNING");
    perfMark("spin_start");

    try {
      const data = await revealGameResult(activeTokenId, experienceUi.spinErrorFallback, controller.signal);
      if (revealControllerRef.current !== controller) return;
      if (!isScratchExperience) { perfMark('reveal_response'); perfMeasure('reveal_latency', 'spin_start', 'reveal_response'); }
      // Guardamos revealedAt pero dejamos que la animación termine (onSpinEnd)
      const winIndex = elements.findIndex((e) => e.prizeId === data.prizeId);
      if (winIndex < 0) throw new Error("Premio no encontrado en la ruleta");
      if (!data.timestamps?.revealedAt) throw new Error("No pudimos confirmar el resultado. Vuelve a consultar este enlace.");
      setToken(t => t ? { ...t, revealedAt: data.timestamps.revealedAt, action: data.action, continuation: data.continuation } : t);
      setPrizeIndex(winIndex);
      const chosen = elements[winIndex];
      // Si el backend indica RETRY, guardamos nextTokenId para transición suave
      const nextTokenId = data.action === 'RETRY' && data.continuation?.state !== 'UNAVAILABLE' ? data.nextTokenId : null;
      setFunctionalTokenId(nextTokenId);
      // Fetch the small result chunk while the wheel is still moving, never on entry.
      if (data.action === 'PRIZE') void import('@/components/roulette/PrizeWinModal').catch(() => {});
      else if (data.action === 'LOSE') void import('@/components/roulette/LoseModal').catch(() => {});
      if (token?.experienceType === "scratch_card") {
        scratchTimeoutRef.current = setTimeout(() => handleSpinEnd(chosen, nextTokenId), ROULETTE_CONFIG.result.scratchRevealDelayMs);
      }
      // La animación del componente NewRoulette usará prizeIndex y disparará handleSpinEnd
    } catch (err) {
      if (revealControllerRef.current !== controller) return;
      setErrorCode(err instanceof GameRequestError ? err.code || null : null);
      console.error("Error al girar:", err);
      setError(controller?.signal.aborted ? 'No pudimos confirmar el resultado a tiempo. Vuelve a consultar este enlace para recuperar tu jugada.' : err instanceof Error ? err.message : experienceUi.spinErrorFallback);
      setPhase("READY");
    } finally {
      window.clearTimeout(timer);
      if (revealControllerRef.current === controller) revealControllerRef.current = null;
    }
  };

  const handleWheelStart = useCallback(() => {
    perfMark('wheel_start');
    if (!document.hidden) void sounds.playSpinStart();
  }, [sounds]);

  const confirmDeliver = async () => {
    if (!activeTokenId) return;
    setDeliverError(null);
    setDelivering(true);
    try {
      const body = await deliverGamePrize(activeTokenId);
      // Update local token state to reflect delivery (mirror redeemedAt)
      if (!body.timestamps?.deliveredAt) throw new Error('No se confirmó la entrega. Vuelve a consultar el enlace.');
      setToken(t => t ? { ...t, deliveredAt: body.timestamps.deliveredAt, redeemedAt: body.timestamps.deliveredAt } : t);
      setPhase("DELIVERED");
      setShowConfetti(false);
    } catch (e: any) {
      setDeliverError(e?.message || "DELIVER_FAILED");
    } finally {
      setDelivering(false);
    }
  };

  const handleFunctionalTokenReady = () => {
    if (!functionalTokenId || navigationPending) return;
    startNavigation(() => router.replace(gamePrizeAccessPath(functionalTokenId, theme)));
  };
  const handleSpinEnd = (prize: RouletteElement, retryTokenOverride?: string | null) => {
    perfMark("spin_end");
    perfMeasure("spin_duration", isScratchExperience ? "spin_start" : "wheel_start", "spin_end");
    // Presupuesto de animación (varía por lowMotion)
    if (!isScratchExperience) perfCheckBudget(
      "spin_duration",
      (lowMotion ? ROULETTE_CONFIG.motion.reducedDurationMs : ROULETTE_CONFIG.motion.durationMs) + ROULETTE_CONFIG.motion.watchdogMs,
      "spin"
    );

    // Detener sonidos de giro y reproducir sonido de parada (sincronizado internamente)
    if (!isScratchExperience && !document.hidden) void sounds.playSpinStop();

    // La continuación ya fue reservada por el servidor; el usuario decide cuándo continuar.
    const retryTokenId = retryTokenOverride || functionalTokenId;
    if (retryTokenId) {
      // Cancelar cualquier timeout de modal anterior
      if (prizeModalTimeoutRef.current) {
        clearTimeout(prizeModalTimeoutRef.current);
        prizeModalTimeoutRef.current = null;
      }
      // Mostrar la continuación confirmada sin consultar la base en bucle.
      setRetryOverlayOpen(true);
      setShowConfetti(false);
      setPrizeIndex(null);
      setPrizeWon(null); // Asegurar que no haya premio mostrado
      setPhase("READY");
      // La transición se inicia al pulsar Continuar.
      return;
    }
    setPrizeWon(prize);
    setShowConfetti(isScratchExperience || prize.key !== GAME_RESULT_KEYS.lose);
    // Incrementar contador local tras completar un giro exitoso
    setSpinCounter((c) => (c == null ? null : c + 1));

    // Reproducir sonido de victoria o derrota según el premio
    if (!isScratchExperience && !document.hidden) {
      celebrationSoundTimeoutRef.current = setTimeout(() => {
        if (document.hidden) return;
        if (prize.key === GAME_RESULT_KEYS.lose) void sounds.playLose();
        else void sounds.playWin();
      }, ROULETTE_CONFIG.result.soundDelayMs);
    }

    // Delay antes de mostrar el modal para que el usuario vea el premio en la ruleta
    prizeModalTimeoutRef.current = setTimeout(() => {
      setPhase("REVEALED_MODAL");
    }, isScratchExperience ? ROULETTE_CONFIG.result.scratchModalDelayMs : ROULETTE_CONFIG.result.modalDelayMs);
  };

  const baseContainerClass = [
    "relative",
    "w-full",
    retryOverlayOpen ? "pointer-events-none" : "",
    themeConfig?.global?.layout?.containerClass || "",
  ]
    .filter(Boolean)
    .join(" ");

  // Cleanup de sonidos al desmontar
  useEffect(() => {
    return () => {
      if (scratchTimeoutRef.current) clearTimeout(scratchTimeoutRef.current);
      if (prizeModalTimeoutRef.current) clearTimeout(prizeModalTimeoutRef.current);
      if (celebrationSoundTimeoutRef.current) clearTimeout(celebrationSoundTimeoutRef.current);
    };
  }, []);

  if (
    token?.revealedAt &&
    token.action === "RETRY" &&
    token.continuation?.state === "UNAVAILABLE" &&
    !retryOverlayOpen
  ) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-white">
        <h2 className="text-xl font-bold">Reintento pendiente</h2>
        <p className="mt-3">
          {token.continuation.message ||
            "Consulta al personal para recuperar tu siguiente oportunidad."}
        </p>
        <p className="mt-3 text-sm text-white/60">
          Conserva este enlace para volver a consultarlo.
        </p>
      </div>
    );
  }
  if (retryOverlayOpen) {
    return <RetryContinuation onContinue={handleFunctionalTokenReady} busy={navigationPending} />;
  }
  if (error) {
    const isTwoPhaseDisabledError = errorCode === "TWO_PHASE_DISABLED";
    const isTokensDisabledError = errorCode === "SYSTEM_OFF";

    const boxTone = isTwoPhaseDisabledError
      ? {
          box: "bg-indigo-500/10 border-indigo-500/30",
          title: "text-indigo-300",
          heading: "Juego no disponible",
          msg: "Esta experiencia no está disponible en este momento. Consulta al personal.",
        }
      : isTokensDisabledError
        ? {
            box: "bg-amber-500/10 border-amber-500/30",
            title: "text-amber-300",
            heading: "Juego no disponible",
            msg: experienceUi.disabledMessage,
          }
        : {
            box: "bg-red-500/10 border-red-500/30",
            title: "text-red-300",
            heading: "Error",
            msg: error,
          };

    return (
      <div className="min-h-[70vh] sm:min-h-[60vh] flex items-center justify-center px-4">
        <div
          className={`w-full max-w-[20rem] sm:max-w-md ${boxTone.box} border rounded-xl p-5 sm:p-6 shadow-lg`}
        >
          <p className={`${boxTone.title} text-base sm:text-lg font-semibold`}>{boxTone.heading}</p>
          <p className="mt-2 text-white/70 text-sm sm:text-base">{boxTone.msg}</p>
          <button
            className="mt-5 w-full sm:w-auto px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => window.location.reload()}
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (phase === "DELIVERED" || token?.redeemedAt || token?.deliveredAt) {
    return (
      <div className={`text-center py-16 max-w-md mx-auto ${getThemeClass(themeConfig)}`}>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
          <p className="text-green-300 text-lg font-semibold">¡Premio ya canjeado!</p>
          <p className="mt-2 text-white/70">
            Este token ya ha sido utilizado para canjear un premio.
          </p>
          <p className="mt-4 text-xl font-bold">{token?.prize?.label}</p>
        </div>
      </div>
    );
  }

  // Evitar mostrar pantallas de token no disponible/expirado durante transición RETRY
  const allowRestrictedScreens = phase === "READY";

  if (allowRestrictedScreens && token?.disabled && token.availability !== "EXPIRED") {
    let availableText: string | null = null;
    try {
      if (token.availableFrom) {
        const d = new Date(token.availableFrom);
        availableText = d.toLocaleString("es-PE", {
          ...(token.timeZone ? { timeZone: token.timeZone } : {}),
          dateStyle: "short",
          timeStyle: "short",
        });
      }
    } catch {
      /* Optional presentation or response parsing failed; existing fallback remains. */
    }
    return (
      <div className={`text-center py-16 max-w-md mx-auto ${getThemeClass(themeConfig)}`}>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
          <p className="text-amber-300 text-lg font-semibold">Token no disponible</p>
          <p className="mt-2 text-white/70">
            {availableText ? (
              <>
                Este token estará habilitado el{" "}
                <span className="font-semibold">{availableText}</span>.
              </>
            ) : (
              <>
                {token.reservedByRetry
                  ? "Este QR está reservado para un reintento. Primero utiliza el QR de nuevo intento."
                  : "Este token no está activo o ha sido deshabilitado."}
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const isExpired = token?.availability === "EXPIRED";

  if (allowRestrictedScreens && isExpired) {
    return (
      <div className={`text-center py-16 max-w-md mx-auto ${getThemeClass(themeConfig)}`}>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
          <p className="text-amber-300 text-lg font-semibold">Token expirado</p>
          <p className="mt-2 text-white/70">Este token ha expirado y ya no puede ser utilizado.</p>
        </div>
      </div>
    );
  }

  const showRevealedPanel =
    !retryOverlayOpen &&
    (phase === "REVEALED_PANEL" || (token?.revealedAt && phase === "READY")) &&
    prizeWon?.key !== GAME_RESULT_KEYS.lose &&
    token?.action !== "RETRY";
  const phaseUi = getPhaseUi(phase);
  const visibleGuideInsights = getVisibleGuideInsights(
    guideInsights,
    GUIDE_SLOT_COUNT,
    guideRotationIndex
  );
  const guideSlots = Array.from(
    { length: GUIDE_SLOT_COUNT },
    (_, index) => visibleGuideInsights[index] ?? null
  );
  const mobileSliderItems = [
    ...guideInsights.map((i) => ({ id: i.id, icon: i.icon, title: i.title, value: i.value })),
    ...(spinCounter != null
      ? [
          {
            id: "__spins__",
            icon: undefined as undefined,
            title: "Giros hoy",
            value: spinCounterFormatter.format(spinCounter),
          },
        ]
      : []),
  ];
  const safeMobileIndex =
    mobileSliderItems.length > 0 ? mobileSliderIndex % mobileSliderItems.length : 0;

  return (
    <div
      className={baseContainerClass}
      aria-hidden={retryOverlayOpen ? true : undefined}
      style={{ opacity: retryOverlayOpen ? 0 : 1 }}
      data-roulette-theme={theme || undefined}
    >
      {!retryOverlayOpen && (
        <div className={layoutStyles.heroShell}>
          <div className={layoutStyles.heroFrame}>
            <div className={layoutStyles.heroInner}>
              <RouletteHeading
                kicker="BIENVENIDO A KTDRAL LOUNGE"
                title={experienceUi.title}
                subtitle={experienceUi.subtitle}
              />
              <div className={layoutStyles.stepRail} aria-label={experienceUi.flowLabel}>
                {experienceUi.steps.map((step, index) => {
                  const stepNumber = index + 1;
                  const active = stepNumber <= phaseUi.activeStep;
                  return (
                    <React.Fragment key={step}>
                      <div
                        className={`${layoutStyles.stepChip} ${active ? layoutStyles.stepChipActive : ""}`.trim()}
                      >
                        <span className={layoutStyles.stepIndex}>
                          {String(stepNumber).padStart(2, "0")}
                        </span>
                        <span className={layoutStyles.stepLabel}>{step}</span>
                      </div>
                      {index < experienceUi.steps.length - 1 && (
                        <span className={layoutStyles.stepDivider} aria-hidden="true" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confetti animation */}
      <Confetti
        active={showConfetti}
        lowMotion={lowMotion}
        colors={themeConfig?.global?.background?.confettiColors}
        quality={isScratchExperience ? undefined : quality}
      />

      {/* Ruleta solo en READY / SPINNING */}
      {(phase === "READY" || phase === "SPINNING") && (
        <>
          <div className={layoutStyles.stageShell}>
            <div className={layoutStyles.stageCard}>
              <div className={layoutStyles.stageBackdrop} aria-hidden="true" />
              <div className={layoutStyles.stageGrid}>
                <aside className={layoutStyles.guidePanel} aria-label="En vivo">
                  <div className={layoutStyles.guideEyebrow}>En vivo</div>
                  <div className={layoutStyles.guideStack}>
                    {guideSlots.map((insight, index) => {
                      const slotNumber = String(index + 1).padStart(2, "0");
                      return (
                        <div key={insight?.id ?? slotNumber} className={layoutStyles.guideStep}>
                          <div className={layoutStyles.guideIndex}>
                            <GuideInsightIcon icon={insight?.icon ?? "placeholder"} />
                          </div>
                          <div>
                            <div className={layoutStyles.guideTitle}>
                              {insight?.title ?? "Actividad en vivo"}
                            </div>
                            {insight ? (
                              <>
                                <div className={layoutStyles.guideInsightValue}>
                                  {insight.value}
                                </div>
                                <div className={layoutStyles.guideText}>{insight.detail}</div>
                              </>
                            ) : (
                              <div className={layoutStyles.guideText}>
                                Cargando actividad en vivo...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {spinCounter != null && (
                    <div className={layoutStyles.metricCard}>
                      <div className={layoutStyles.metricLabel}>
                        {experienceUi.dailyMetricLabel}
                      </div>
                      <div className={layoutStyles.metricValue}>
                        {spinCounterFormatter.format(spinCounter)}
                      </div>
                    </div>
                  )}
                </aside>

                <div className={layoutStyles.wheelPanel}>
                  <div className={layoutStyles.wheelStage}>
                    {token?.experienceType === "scratch_card" ? (
                      <ScratchCardExperience
                        prizeLabel={token.prize.label}
                        disabled={phase !== "READY"}
                        revealing={phase === "SPINNING"}
                        revealed={phase !== "READY" && phase !== "SPINNING"}
                        onReveal={handleSpin}
                      />
                    ) : (
                      <NewRoulette
                        key={activeTokenId}
                        elements={elements}
                        onSpin={handleSpin}
                        onSpinEnd={handleSpinEnd}
                        spinning={phase === "SPINNING"}
                        prizeIndex={prizeIndex}
                        variant="inline"
                        lowMotion={lowMotion}
                        quality={quality}
                        onSpinStart={handleWheelStart}
                        onSectorTick={sounds.playSectorTick}
                        theme={theme}
                      />
                    )}
                  </div>
                  {token?.experienceType !== "scratch_card" && (
                    <div className={layoutStyles.spinCue} role="status">{phase === 'SPINNING' && prizeIndex === null ? 'Confirmando tu jugada…' : experienceUi.instruction}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Insights en móvil: slider automático (el guidePanel cubre los mismos datos en desktop) */}
          {mobileSliderItems.length > 0 && (
            <div className={layoutStyles.mobileInsightsRail}>
              <div
                className={layoutStyles.mobileInsightsTrack}
                style={{ transform: `translateX(-${safeMobileIndex * 100}%)` }}
              >
                {mobileSliderItems.map((item) => (
                  <div key={item.id} className={layoutStyles.mobileInsightBubble}>
                    <div className={layoutStyles.mobileInsightCard}>
                      {item.icon != null && (
                        <div className={layoutStyles.mobileInsightIcon}>
                          <GuideInsightIcon icon={item.icon} />
                        </div>
                      )}
                      <div className={layoutStyles.mobileInsightContent}>
                        <div className={layoutStyles.mobileInsightLabel}>{item.title}</div>
                        <div className={layoutStyles.mobileInsightValue}>{item.value}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {mobileSliderItems.length > 1 && (
                <div className={layoutStyles.mobileSliderDots}>
                  {mobileSliderItems.map((_, i) => (
                    <div
                      key={i}
                      className={
                        i === safeMobileIndex
                          ? layoutStyles.mobileSliderDotActive
                          : layoutStyles.mobileSliderDot
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Panel permanente tras cerrar modal */}
      {showRevealedPanel && prizeWon && (
        <div className={layoutStyles.revealedShell}>
          <div className={layoutStyles.revealedCard}>
            <div className={layoutStyles.revealedInner}>
              <div className={layoutStyles.revealedKicker}>Premio revelado</div>
              <div className={layoutStyles.revealedPrizeCard}>
                <div className={layoutStyles.revealedPrize}>{prizeWon.label}</div>
              </div>
              {token?.action === "PRIZE" && (
                <PrizeRedemptionQr tokenId={activeTokenId} />
              )}
              <div className={layoutStyles.revealedActions}>
                <PrizeDeliveryAction
                  onClick={confirmDeliver}
                  disabled={delivering}
                  busy={delivering}
                />
              </div>
              {deliverError && <div className={layoutStyles.revealedError}>{deliverError}</div>}
            </div>
          </div>
        </div>
      )}

      {prizeWon && phase === "REVEALED_MODAL" && prizeWon.key !== GAME_RESULT_KEYS.lose && !functionalTokenId && (
        <PrizeWinModal label={prizeWon.label} tokenId={token?.action === "PRIZE" ? activeTokenId : undefined} onClose={() => { setPhase("REVEALED_PANEL"); setShowConfetti(false); }} />
      )}

      {/* Modal específico para lose/piña */}
      {prizeWon &&
        phase === "REVEALED_MODAL" &&
        prizeWon.key === GAME_RESULT_KEYS.lose &&
        !functionalTokenId && <LoseModal open={true} />}
    </div>
  );
}
