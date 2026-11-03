"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import React, { useEffect, useRef, useState } from "react";

import SmartPreloader from "@/components/common/SmartPreloader";
import { PrizeDeliveryAction } from "@/components/prize-authorization/PrizeDeliveryAction";
import { PrizeRedemptionQr } from "@/components/roulette/PrizeRedemptionQr";
import LoseModal from "@/components/roulette/LoseModal";
import NewRoulette from "@/components/roulette/NewRoulette";
import RetryContinuation from "@/components/roulette/RetryContinuation";
import RouletteHeading from "@/components/roulette/RouletteHeading";
import { ROULETTE_SPIN_DURATION_MS } from "@/components/roulette/motion";
import { RouletteElement } from "@/components/roulette/types";
import { useRouletteSounds } from "@/hooks/useRouletteSounds";
import { getExperienceUi } from "@/lib/experiences/config";
import { perfCheckBudget, perfMark, perfMeasure, perfSummarize } from "@/lib/perf";
import {
  deliverGamePrize,
  GameRequestError,
  loadPrizeGame,
  revealGameResult,
} from "@/lib/prize-games/client";
import type { GameAction, GameContinuation } from "@/lib/prize-games/contracts";
import { ThemeName } from "@/lib/themes/types";
import { useRouletteTheme } from "@/lib/themes/useRouletteTheme";

import layoutStyles from "./rouletteLayout.module.css";

const ScratchCardExperience = dynamic(() => import("@/components/experiences/ScratchCardExperience"), { ssr: false });
const CanvasConfetti = dynamic(() => import("@/components/visual/CanvasConfetti"), { ssr: false });

// Confetti ahora usando canvas para menos costo en DOM
const Confetti = ({
  active,
  lowMotion = false,
  colors,
}: {
  active: boolean;
  lowMotion?: boolean;
  colors?: string[];
}) => active && !lowMotion ? <CanvasConfetti active lowMotion={lowMotion} colors={colors} /> : null;

// Función helper para obtener clases CSS del tema
const getThemeClass = (themeConfig: any) => {
  return themeConfig?.global?.layout?.themeClass || "";
};

const spinCounterFormatter = new Intl.NumberFormat("en-US", {
  minimumIntegerDigits: 3,
  maximumFractionDigits: 0,
  useGrouping: true,
});

const GUIDE_SLOT_COUNT = 3;

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

interface TokenShape {
  timeZone?: string;
  id: string;
  expiresAt: string;
  redeemedAt: string | null;
  revealedAt?: string | null;
  deliveredAt?: string | null;
  disabled: boolean;
  availableFrom?: string | null;
  batchId?: string;
  experienceType?: "roulette" | "scratch_card";
  reservedByRetry?: boolean;
  action?: GameAction;
  availability?: string;
  continuation?: GameContinuation | null;
  prize: { id: string; key: string; label: string; color: string | null; active: boolean };
}

interface RouletteClientPageProps {
  theme?: ThemeName;
}

/** Configuración centralizada de tiempos y tuning del cliente de ruleta */
const ROULETTE_CONFIG = {
  fetchTimeoutMs: 12000, // abort fetch si el backend tarda demasiado
  loadBudgetMs: 2500, // presupuesto orientativo de carga total
  sidebarFetchTimeoutMs: 5000,
  sidebarRefreshMs: 30000,
  guideRotationMs: 12000,
  perfSampleRate: 0.15, // tasa de muestreo para perfSummarize
  spinBudgetMs: { normal: 6200, lowMotion: 3600 }, // margen para perfCheckBudget
  soundStartDelayMs: 300, // delay antes de iniciar sonidos de giro
  softSwitchDelayMs: 500, // delay de transición suave tras retry
  prizeModalDelayMs: 1500, // delay antes de mostrar el modal de premio
  smallViewportWidth: 380, // ancho mínimo para heurística de low motion
  smallViewportHeight: 680, // alto mínimo para heurística de low motion
} as const;

export default function RouletteClientPage({
  theme: propTheme = "default",
}: RouletteClientPageProps) {
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const tokenId = isHydrated ? searchParams?.get("tokenId") || "" : "";
  // Usar el hook de tema para obtener la configuración
  const { theme: contextTheme, config } = useRouletteTheme();
  const theme = propTheme || contextTheme;
  const themeConfig = config;

  // Inicializar sonidos de la ruleta
  const sounds = useRouletteSounds();

  // Mark initial mount
  useEffect(() => {
    perfMark("page_mount");
    setIsHydrated(true);
  }, []);
  const [loading, setLoading] = useState(true);
  // Token activo en UI (permite cambiar sin navegación dura)
  const [activeTokenId, setActiveTokenId] = useState<string>(tokenId);
  // Bandera para transición suave (no mostrar overlay) - ahora ref para evitar re-ejecuciones
  const softSwitchRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [token, setToken] = useState<TokenShape | null>(null);
  const isScratchExperience = token?.experienceType === "scratch_card";
  const [elements, setElements] = useState<RouletteElement[]>([]);
  type Phase = "READY" | "SPINNING" | "REVEALED_MODAL" | "REVEALED_PANEL" | "DELIVERED";
  const [phase, setPhase] = useState<Phase>("READY");
  const [prizeIndex, setPrizeIndex] = useState<number | null>(null);
  const [prizeWon, setPrizeWon] = useState<RouletteElement | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [lowMotion, setLowMotion] = useState(false);
  // Overlay minimal para RETRY (oculta cabeceras y copia mientras cambia el token)
  const [retryOverlayOpen, setRetryOverlayOpen] = useState(false);
  // Suprime la UI de "premio revelado" cuando el resultado es RETRY
  const [suppressRevealed, setSuppressRevealed] = useState(false);
  // Suprime el loader durante la transición a la continuación de RETRY.
  const [suppressLoader, setSuppressLoader] = useState(false);
  const suppressLoaderRef = useRef(suppressLoader);
  suppressLoaderRef.current = suppressLoader;
  const paletteRef = useRef(themeConfig?.roulette?.segments?.palette);
  paletteRef.current = themeConfig?.roulette?.segments?.palette;
  // Bandera para transición de retry, para suprimir errores
  const [isRetryTransition, setIsRetryTransition] = useState(false);
  const prizeModalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setLowMotion(media.matches || (!!memory && memory <= 2) || window.innerWidth < ROULETTE_CONFIG.smallViewportWidth || window.innerHeight < ROULETTE_CONFIG.smallViewportHeight);
    };
    update();
    media.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => { media.removeEventListener?.('change', update); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    const update = () => {
      const quiet = lowMotion || phase === 'SPINNING' || document.hidden;
      document.documentElement.toggleAttribute('data-roulette-quiet', quiet);
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { document.removeEventListener('visibilitychange', update); document.documentElement.removeAttribute('data-roulette-quiet'); };
  }, [lowMotion, phase]);

  // Los indicadores son informativos: no retrasan la carga del juego ni se actualizan en segundo plano.
  useEffect(() => {
    if (loading || !activeTokenId) return;
    let active = true;
    let inFlight: AbortController | null = null;
    const loadSummary = async () => {
      if (document.hidden || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timeout = window.setTimeout(() => controller.abort(), ROULETTE_CONFIG.sidebarFetchTimeoutMs);
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
    void loadSummary();
    const timer = window.setInterval(loadSummary, ROULETTE_CONFIG.sidebarRefreshMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { active = false; inFlight?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [loading, activeTokenId]);

  useEffect(() => {
    if (guideInsights.length <= GUIDE_SLOT_COUNT) {
      setGuideRotationIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) setGuideRotationIndex((current) => (current + 1) % guideInsights.length);
    }, ROULETTE_CONFIG.guideRotationMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [guideInsights.length]);

  useEffect(() => {
    const totalItems = guideInsights.length + (spinCounter != null ? 1 : 0);
    if (totalItems <= 1) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setMobileSliderIndex((prev) => (prev + 1) % totalItems);
    }, 3200);
    return () => window.clearInterval(id);
  }, [guideInsights.length, spinCounter]);

  // Reconstrucción en recarga: si el token ya está revelado / entregado.
  useEffect(() => {
    if (!token) return;
    if (suppressRevealed) return; // no mostrar panel si estamos en transición de RETRY
    if (
      token.revealedAt &&
      token.action === "RETRY" &&
      token.continuation &&
      token.continuation.state !== "UNAVAILABLE" &&
      phase === "READY"
    ) {
      setFunctionalTokenId(token.continuation.tokenId);
      setRetryOverlayOpen(true);
      setSuppressRevealed(true);
      return;
    }
    if (token.deliveredAt || token.redeemedAt) {
      setPhase("DELIVERED");
      return;
    }
    if (token.revealedAt && phase === "READY") {
      // Derivar prizeIndex del premio original.
      if (elements.length) {
        const idx = elements.findIndex((e) => e.prizeId === token.prize.id);
        if (idx >= 0) {
          setPrizeIndex(idx);
          setPrizeWon(elements[idx]);
          setPhase(token.action === "LOSE" ? "REVEALED_MODAL" : "REVEALED_PANEL");
        }
      }
    }
  }, [token, elements, suppressRevealed, phase]);

  useEffect(() => {
    // Si el prop cambia (navegación externa), sincroniza estado base
    setActiveTokenId(tokenId || "");
  }, [tokenId]);

  useEffect(() => {
    if (!activeTokenId) {
      setError("No se ha proporcionado un token");
      setLoading(false);
      return;
    }

    // Reset UI sólo para carga dura; en suave mantenemos UI y cambiamos al final
    if (!softSwitchRef.current) {
      // No mostrar loader si estamos en transición RETRY
      if (!suppressLoaderRef.current) setLoading(true);
      setError(null);
      setErrorCode(null);
      setToken(null);
      setElements([]);
      setPhase("READY");
      setPrizeIndex(null);
      setPrizeWon(null);
      setShowConfetti(false);
      setDelivering(false);
      setDeliverError(null);
    } else {
      setError(null);
      setErrorCode(null);
    }

    let abort = false;
    const loadController = new AbortController();

    (async function loadToken() {
      perfMark("load_start");
      try {
        const timer = setTimeout(() => loadController.abort(), ROULETTE_CONFIG.fetchTimeoutMs);
        let data;
        try {
          data = await loadPrizeGame(activeTokenId, loadController.signal);
        } finally {
          clearTimeout(timer);
        }

        if (abort) return;
        // En transición suave, aplicamos cambios al final de golpe
        const applyData = () => {
          setToken(data.token);
          if (data.elements && Array.isArray(data.elements)) {
            const rouletteElements = data.elements.map((e, index: number) => ({
              label: e.label,
              color:
                e.color ||
                paletteRef.current?.[index % (paletteRef.current?.length || 1)] ||
                "#CCCCCC",
              prizeId: e.prizeId,
              key: e.key,
            }));
            setElements(rouletteElements);
          }
        };
        const isSoft = softSwitchRef.current;
        if (isSoft) {
          applyData();
          // La continuación conserva un segundo juego manual.
          setPhase("READY");
          // Finalizar la transición cuando se cargan los datos de la continuación.
        } else {
          applyData();
        }
      } catch (err) {
        if (!abort) {
          setErrorCode(err instanceof GameRequestError ? err.code || null : null);
          console.error("Error cargando datos:", err);
          // Check if it's a network/server error
          const isServerError =
            err instanceof Error &&
            (err.message.includes("502") ||
              err.message.includes("503") ||
              err.message.includes("504") ||
              err.message.includes("Application failed to respond") ||
              err.message.includes("Tiempo de espera agotado"));

          if (isServerError && !softSwitchRef.current) {
            // Do not keep the loader open with a no-op state update. A value
            // set to itself does not rerun this effect and caused an endless
            // loading screen when the API was unavailable.
            setError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
          } else if (!softSwitchRef.current) {
            setError(err instanceof Error ? err.message : "Error desconocido");
          }
        }
      } finally {
        if (!abort) {
          setLoading(false); // Siempre ocultar loader al final, independientemente de softSwitch
          // Si fue softSwitch, evitamos overlay; limpiamos bandera
          if (softSwitchRef.current) {
            softSwitchRef.current = false;
            setIsRetryTransition(false);
            setRetryOverlayOpen(false); // Cerrar overlay después de carga completa
          }
          perfMark("loader_hidden");
          perfMeasure("load_total", "load_start", "loader_hidden");
          // Presupuesto de carga
          perfCheckBudget("load_total", ROULETTE_CONFIG.loadBudgetMs, "load");
          // Log summary occasionally
          if (typeof window !== "undefined" && Math.random() < ROULETTE_CONFIG.perfSampleRate)
            perfSummarize();
        }
      }
    })();

    return () => {
      abort = true;
      loadController.abort();
    };
  }, [activeTokenId]);

  const handleSpin = async () => {
    if (phase !== "READY") return;
    if (!activeTokenId) return;
    if (token?.revealedAt || token?.redeemedAt || token?.deliveredAt) return;
    setPhase("SPINNING");
    perfMark("spin_start");

    try {
      const data = await revealGameResult(activeTokenId, experienceUi.spinErrorFallback);
      // Guardamos revealedAt pero dejamos que la animación termine (onSpinEnd)
      setToken((t) =>
        t ? { ...t, revealedAt: data?.timestamps?.revealedAt || new Date().toISOString() } : t
      );
      const winIndex = elements.findIndex((e) => e.prizeId === data.prizeId);
      if (winIndex < 0) throw new Error("Premio no encontrado en la ruleta");
      if (!isScratchExperience) soundStartTimeoutRef.current = setTimeout(() => {
        void sounds.playSpinStart();
        void sounds.playSpinLoop({ expectedDurationMs: lowMotion ? ROULETTE_SPIN_DURATION_MS.lowMotion : ROULETTE_SPIN_DURATION_MS.normal });
      }, ROULETTE_CONFIG.soundStartDelayMs);
      setPrizeIndex(winIndex);
      const chosen = elements[winIndex];
      // Si el backend indica RETRY, guardamos nextTokenId para transición suave
      if (data?.action === "RETRY" && data?.nextTokenId) {
        setFunctionalTokenId(data.nextTokenId); // El token funcional es el nextTokenId
      } else {
        setFunctionalTokenId(null);
      }
      if (token?.experienceType === "scratch_card") {
        scratchTimeoutRef.current = setTimeout(() => handleSpinEnd(chosen, data?.nextTokenId || null), 900);
      }
      // La animación del componente NewRoulette usará prizeIndex y disparará handleSpinEnd
    } catch (err) {
      if (soundStartTimeoutRef.current) clearTimeout(soundStartTimeoutRef.current);
      soundStartTimeoutRef.current = null;
      void sounds.stopSpinLoop();
      setErrorCode(err instanceof GameRequestError ? err.code || null : null);
      console.error("Error al girar:", err);
      setError(err instanceof Error ? err.message : experienceUi.spinErrorFallback);
      setPhase("READY");
    }
  };

  const confirmDeliver = async () => {
    if (!activeTokenId) return;
    setDeliverError(null);
    setDelivering(true);
    try {
      const body = await deliverGamePrize(activeTokenId);
      // Update local token state to reflect delivery (mirror redeemedAt)
      setToken((t) =>
        t
          ? ({
              ...t,
              deliveredAt: body?.timestamps?.deliveredAt || new Date().toISOString(),
              redeemedAt: body?.timestamps?.deliveredAt || new Date().toISOString(),
            } as any)
          : t
      );
      setPhase("DELIVERED");
      setShowConfetti(false);
    } catch (e: any) {
      setDeliverError(e?.message || "DELIVER_FAILED");
    } finally {
      setDelivering(false);
    }
  };

  // Token funcional que se habilita después de reveal de retry
  const [functionalTokenId, setFunctionalTokenId] = useState<string | null>(null);

  // Callback cuando el token funcional está listo
  const handleFunctionalTokenReady = () => {
    // Cleanup agresivo antes de la transición
    setToken(null); // Forzar recarga completa de token
    setElements([]); // Limpiar elementos anteriores
    setPrizeWon(null);
    setPrizeIndex(null);
    setPhase("READY");

    // El usuario continúa hacia su token funcional sin consultar en bucle
    transitionTimeoutRef.current = setTimeout(() => {
      try {
        const newUrl = `/marketing/ruleta?tokenId=${encodeURIComponent(functionalTokenId!)}`;
        window.history.replaceState(null, "", newUrl);
      } catch (error) {
        console.error(`❌ [Roulette] Error en redirección:`, error);
      }
      softSwitchRef.current = true;
      // Auto-spin desactivado para segundo giro - interacción manual
      setActiveTokenId(functionalTokenId!);
      // Limpiar estados de retry completamente
      setFunctionalTokenId(null);
      setIsRetryTransition(false);
      setRetryOverlayOpen(false);
      setSuppressRevealed(false);
    }, ROULETTE_CONFIG.softSwitchDelayMs);
  };
  const handleSpinEnd = (prize: RouletteElement, retryTokenOverride?: string | null) => {
    perfMark("spin_end");
    perfMeasure("spin_duration", "spin_start", "spin_end");
    // Presupuesto de animación (varía por lowMotion)
    perfCheckBudget(
      "spin_duration",
      lowMotion ? ROULETTE_CONFIG.spinBudgetMs.lowMotion : ROULETTE_CONFIG.spinBudgetMs.normal,
      "spin"
    );

    // Detener sonidos de giro y reproducir sonido de parada (sincronizado internamente)
    if (!isScratchExperience) void sounds.playSpinStop();

    // La continuación ya fue reservada por el servidor; el usuario decide cuándo continuar.
    const retryTokenId = retryTokenOverride || functionalTokenId;
    if (retryTokenId) {
      // Cancelar cualquier timeout de modal anterior
      if (prizeModalTimeoutRef.current) {
        clearTimeout(prizeModalTimeoutRef.current);
        prizeModalTimeoutRef.current = null;
      }
      // Mostrar la continuación confirmada sin consultar la base en bucle.
      setIsRetryTransition(true);
      setRetryOverlayOpen(true);
      setSuppressRevealed(true);
      // Asegurar que no aparezca overlay de loader
      setLoading(false);
      setSuppressLoader(true);
      setShowConfetti(false);
      setPrizeIndex(null);
      setPrizeWon(null); // Asegurar que no haya premio mostrado
      setPhase("READY");
      // La transición se inicia al pulsar Continuar.
      return;
    }
    setPrizeWon(prize);
    setShowConfetti(true);
    // Incrementar contador local tras completar un giro exitoso
    setSpinCounter((c) => (c == null ? null : c + 1));

    // Reproducir sonido de victoria o derrota según el premio
    if (!isScratchExperience && prize.key === "lose") {
      sounds.playLose();
    } else if (!isScratchExperience) {
      sounds.playWin();
    }

    // Delay antes de mostrar el modal para que el usuario vea el premio en la ruleta
    prizeModalTimeoutRef.current = setTimeout(() => {
      setPhase("REVEALED_MODAL");
    }, ROULETTE_CONFIG.prizeModalDelayMs);
  };

  // Al cambiar de token (softSwitch), desactivar supresión del panel para el nuevo ciclo
  useEffect(() => {
    if (!activeTokenId) return;
    // permitir paneles normales para el nuevo token; no afecta RETRY in-flight
    setSuppressRevealed(false);
  }, [activeTokenId]);

  // (sin aviso toast)

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
      if (soundStartTimeoutRef.current) clearTimeout(soundStartTimeoutRef.current);
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      if (scratchTimeoutRef.current) clearTimeout(scratchTimeoutRef.current);
      if (prizeModalTimeoutRef.current) clearTimeout(prizeModalTimeoutRef.current);
      sounds.cleanup();
    };
  }, [sounds]);

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
    return <RetryContinuation onContinue={handleFunctionalTokenReady} />;
  }
  if (loading && !suppressLoader && !retryOverlayOpen) {
    return (
      <div
        className={`fixed inset-0 z-[100] overflow-hidden flex items-center justify-center roulette-loading-overlay touch-none ${getThemeClass(themeConfig)}`}
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="relative z-[1]">
          <SmartPreloader logoSrc="/logo.png" />
        </div>
      </div>
    );
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
  const transitionGuardActive = retryOverlayOpen || suppressLoader || softSwitchRef.current;
  const allowRestrictedScreens = !transitionGuardActive && phase === "READY";

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

  const isExpired =
    isHydrated &&
    (token?.availability === "EXPIRED" ||
      (token?.expiresAt && new Date(token.expiresAt) <= new Date()));

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
    !suppressRevealed &&
    (phase === "REVEALED_PANEL" || (token?.revealedAt && phase === "READY")) &&
    prizeWon?.key !== "lose" &&
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
                        elements={elements}
                        onSpin={handleSpin}
                        onSpinEnd={handleSpinEnd}
                        spinning={phase === "SPINNING"}
                        prizeIndex={prizeIndex}
                        variant="inline"
                        lowMotion={lowMotion}
                        theme={theme}
                      />
                    )}
                  </div>
                  {token?.experienceType !== "scratch_card" && (
                    <div className={layoutStyles.spinCue}>{experienceUi.instruction}</div>
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

      {/* Modal con el premio ganado - usando AnimatePresence para animaciones de salida */}
      <AnimatePresence>
        {prizeWon &&
          phase === "REVEALED_MODAL" &&
          prizeWon.key !== "lose" &&
          !isRetryTransition &&
          !functionalTokenId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3 } }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.2 } }}
                className="absolute inset-0 bg-black/75 backdrop-blur-md"
                onClick={() => {
                  setPhase("REVEALED_PANEL");
                  setShowConfetti(false);
                }}
              ></motion.div>

              <motion.div
                initial={{ y: 30, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.9, transition: { duration: 0.4 } }}
                className="relative z-10 rounded-xl p-6 sm:p-8 max-w-md w-full border border-white/10 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain overflow-x-hidden"
                style={{
                  background:
                    themeConfig?.global?.modal?.background ||
                    "linear-gradient(180deg, #0E0606, #07070C)",
                  boxShadow:
                    themeConfig?.global?.modal?.boxShadow ||
                    "0 12px 32px -10px rgba(255,77,46,0.6)",
                }}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute top-3 right-3"
                >
                  <button
                    onClick={() => {
                      setPhase("REVEALED_PANEL");
                      setShowConfetti(false);
                    }}
                    className="bg-white/10 hover:bg-white/20 rounded-full p-2 text-white/80 hover:text-white transition-colors"
                    aria-label="Cerrar"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>

                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0.2, y: -20, rotateZ: -20 }}
                    animate={{ scale: 1, y: 0, rotateZ: 0 }}
                    transition={{
                      type: "spring",
                      damping: 8,
                      stiffness: 100,
                      delay: 0.1,
                    }}
                    className="text-5xl sm:text-7xl mb-4 sm:mb-6 inline-block"
                  >
                    🎉
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mb-2"
                  >
                    <motion.h2
                      initial={{ y: 10 }}
                      animate={{ y: 0 }}
                      transition={{ type: "spring", damping: 12 }}
                      className="text-2xl sm:text-3xl font-bold mb-1"
                    >
                      ¡Bien hecho!
                    </motion.h2>
                    <motion.div
                      className={`w-16 h-1 mx-auto rounded-full ${themeConfig?.global?.modal?.accentGradient || "bg-gradient-to-r from-[#FF4D2E] to-[#FF7A3C]"}`}
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="my-6"
                  >
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55 }}
                      className="text-sm sm:text-base text-white/70 mb-1"
                    >
                      Has desbloqueado:
                    </motion.p>
                    <motion.p
                      className={`text-2xl sm:text-4xl font-extrabold text-transparent bg-clip-text my-2 px-2 sm:px-4 break-words ${themeConfig?.global?.modal?.accentGradient || "bg-gradient-to-r from-[#FF4D2E] to-[#FF7A3C]"}`}
                      animate={{
                        backgroundPosition: ["0% center", "100% center", "0% center"],
                      }}
                      transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      style={{
                        backgroundSize: "200% 100%",
                      }}
                    >
                      {prizeWon.label}
                    </motion.p>
                  </motion.div>

                  {token?.action === "PRIZE" && (
                    <div className="mb-5 text-white/90">
                      <PrizeRedemptionQr tokenId={activeTokenId} />
                    </div>
                  )}

                  <motion.button
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                    className={`px-6 sm:px-10 py-3 sm:py-4 rounded-full font-bold transition-all shadow-lg hover:shadow-xl text-base sm:text-lg ${themeConfig?.global?.buttons?.primary || "bg-gradient-to-r from-[#FF4D2E] to-[#FF7A3C] hover:from-[#ff5e44] hover:to-[#ff8a54] text-white"}`}
                    onClick={() => {
                      setPhase("REVEALED_PANEL");
                      setShowConfetti(false);
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    ¡A rumbear!
                  </motion.button>
                  {/* Staff delivery button removed from modal per request */}
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Modal específico para lose/piña */}
      {prizeWon &&
        phase === "REVEALED_MODAL" &&
        prizeWon.key === "lose" &&
        !isRetryTransition &&
        !functionalTokenId && <LoseModal open={true} />}
    </div>
  );
}
