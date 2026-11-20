"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { WELCOME_PLAYERS_DEFAULT_CONFIG, WELCOME_PLAYERS_FALLBACK_CONFIG, WELCOME_PLAYERS_STATS_REFRESH_MS, WELCOME_PLAYERS_REQUEST_TIMEOUT_MS, WELCOME_PLAYERS_CONFIG_RETRY_MS } from "@/lib/welcomeplayers/config";
import {
  getWelcomePlayersLayoutProfile,
  getWelcomePlayersWheelSize,
  normalizeWelcomePlayersDisplayMode,
  resolveWelcomePlayersDisplayMode,
  type WelcomePlayersDisplayMode,
} from "@/lib/welcomeplayers/layout";
import type { WelcomePlayerPrize, WelcomePlayersRouletteConfig } from "@/lib/welcomeplayers/types";
import { WELCOME_PLAYERS_DEFAULT_MESSAGE } from "@/lib/welcomeplayers/message";
import { EMPTY_WELCOME_ATTRACT, WELCOME_ATTRACT_IDLE_MS, WELCOME_ATTRACT_REFRESH_MS, type WelcomeAttractConfig } from "@/lib/welcomeplayers/attract";
import attractEffects from "@/components/welcomeplayers/attractEffects.module.css";
import styles from "./welcomeplayers.module.css";

type SpinResponse = {
  spinId: string;
  prize: WelcomePlayerPrize;
  prizeIndex: number;
  turns: number;
  rotation: number;
  createdAt: string;
};

type StatsResponse = {
  businessDay: string;
  totalSpins: number;
  activePrizes: number;
  topPrize: null | { prizeId: string; label: string; color: string; count: number };
  lastPrize: null | { prizeId: string; label: string; color: string; createdAt: string };
  prizeCounts: Array<{ prizeId: string; label: string; color: string; count: number }>;
  recentSpins: Array<{ spinId: string; prizeId: string; label: string; color: string; createdAt: string }>;
};

type WelcomePlayersResolvedDisplayMode = Exclude<WelcomePlayersDisplayMode, "auto">;

const SPIN_DURATION_MS = 5600;
const PENDING_SPIN_STORAGE_KEY = "welcomeplayers.pendingSpin";

function persistPendingSpin(id: string | null) {
  try {
    if (id) sessionStorage.setItem(PENDING_SPIN_STORAGE_KEY, id);
    else sessionStorage.removeItem(PENDING_SPIN_STORAGE_KEY);
  } catch { /* La ruleta también funciona sin almacenamiento de sesión. */ }
}

function readPendingSpin() {
  try {
    const id = sessionStorage.getItem(PENDING_SPIN_STORAGE_KEY);
    return id && /^[0-9a-f]{32}$/i.test(id) ? id : null;
  } catch { return null; }
}
const VIEWBOX = 1000;
const CENTER = VIEWBOX / 2;
const RADIUS = 430;
const INNER_RADIUS = 165;
const LABEL_RADIAL_PADDING = 34;
const LABEL_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
let labelMeasureCanvas: HTMLCanvasElement | null = null;

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function buildSegments(prizes: WelcomePlayerPrize[]) {
  return prizes.filter((prize) => prize.status === "active").sort((a, b) => a.order - b.order);
}

function makeSegmentPath(index: number, total: number) {
  const segmentAngle = 360 / Math.max(total, 1);
  const startAngle = -90 + index * segmentAngle;
  const endAngle = startAngle + segmentAngle;
  const start = polarToCartesian(CENTER, CENTER, RADIUS, endAngle);
  const end = polarToCartesian(CENTER, CENTER, RADIUS, startAngle);
  const largeArcFlag = segmentAngle > 180 ? 1 : 0;

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function splitLabel(label: string) {
  const clean = label.trim().replace(/\s+/g, " ");
  if (!clean) return ["Premio"];

  const words = clean.split(" ");
  if (clean.length <= 10 || words.length === 1) return [clean];
  if (clean.length <= 18) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
  }
  if (clean.length <= 28) {
    const splitPoint = Math.ceil(words.length / 2);
    return [words.slice(0, splitPoint).join(" "), words.slice(splitPoint).join(" ")].filter(Boolean);
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 14 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function getRadialTextRotation(angle: number) {
  const normalized = ((angle % 360) + 360) % 360;
  const flip = normalized > 90 && normalized < 270;
  return angle - 90 + (flip ? 180 : 0);
}

function getSegmentLabelRadius(slice: number) {
  const sliceRadians = (slice * Math.PI) / 180;
  const outerTerm = Math.pow(RADIUS, 3);
  const innerTerm = Math.pow(INNER_RADIUS, 3);
  const outerArea = Math.pow(RADIUS, 2);
  const innerArea = Math.pow(INNER_RADIUS, 2);
  const centroid = (4 * Math.sin(sliceRadians / 2) * (outerTerm - innerTerm)) / (3 * sliceRadians * (outerArea - innerArea));
  return Number.isFinite(centroid) ? centroid : (INNER_RADIUS + RADIUS) / 2;
}

function getLabelMeasureContext() {
  if (typeof document === "undefined") {
    return null;
  }

  if (!labelMeasureCanvas) {
    labelMeasureCanvas = document.createElement("canvas");
  }

  return labelMeasureCanvas.getContext("2d");
}

function measureTextWidth(text: string, fontSize: number) {
  const context = getLabelMeasureContext();
  if (!context) {
    return text.length * fontSize * 0.6;
  }

  context.font = `900 ${fontSize}px ${LABEL_FONT_FAMILY}`;
  return context.measureText(text).width;
}

function measureLabelLayout(lines: string[], fontSize: number) {
  const context = getLabelMeasureContext();
  const fallbackAscent = fontSize * 0.78;
  const fallbackDescent = fontSize * 0.22;

  if (!context) {
    return {
      widestLine: lines.reduce((max, line) => Math.max(max, measureTextWidth(line.toUpperCase(), fontSize)), 0),
      ascent: fallbackAscent,
      descent: fallbackDescent,
      lineHeight: fontSize * 1.02,
    };
  }

  context.font = `900 ${fontSize}px ${LABEL_FONT_FAMILY}`;

  let widestLine = 0;
  let ascent = 0;
  let descent = 0;

  for (const line of lines) {
    const metrics = context.measureText(line.toUpperCase());
    widestLine = Math.max(widestLine, metrics.width);
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || fallbackAscent);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || fallbackDescent);
  }

  return {
    widestLine,
    ascent,
    descent,
    lineHeight: ascent + descent || fontSize * 1.02,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}


function fitSegmentLabel(lines: string[], slice: number) {
  const anglePadding = Math.max(12, (RADIUS - INNER_RADIUS) * 0.08);
  const sliceRadians = (slice * Math.PI) / 180;
  const targetRadius = getSegmentLabelRadius(slice);
  const maxFontSize = Math.min(30, Math.max(20, Math.round((RADIUS - INNER_RADIUS) * 0.11)));
  const minFontSize = Math.max(11, Math.min(16, Math.round(maxFontSize * 0.5)));

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const labelLayout = measureLabelLayout(lines, fontSize);
    const lineGap = Math.max(2, Math.round(fontSize * 0.12));
    const blockWidth = labelLayout.widestLine;
    const blockHeight = labelLayout.lineHeight * lines.length + lineGap * Math.max(0, lines.length - 1);
    const minRadius = INNER_RADIUS + anglePadding + blockWidth / 2;
    const maxRadius = RADIUS - anglePadding - blockWidth / 2;
    if (minRadius > maxRadius) {
      continue;
    }

    const radius = clamp(targetRadius, minRadius, maxRadius);
    const tangentialHalfSpace = radius * Math.tan(sliceRadians / 2) - anglePadding;
    if (blockHeight / 2 > tangentialHalfSpace) {
      continue;
    }

    const totalBlockHeight = blockHeight;
    const firstLineY = -totalBlockHeight / 2 + labelLayout.ascent;
    return {
      fontSize,
      radius,
      lineStep: labelLayout.lineHeight + lineGap,
      firstLineY,
    };
  }

  const fallbackSize = minFontSize;
  const fallbackLayout = measureLabelLayout(lines, fallbackSize);
  const fallbackGap = Math.max(2, Math.round(fallbackSize * 0.12));
  return {
    fontSize: fallbackSize,
    radius: targetRadius,
    lineStep: fallbackLayout.lineHeight + fallbackGap,
    firstLineY: -(fallbackLayout.lineHeight * lines.length + fallbackGap * Math.max(0, lines.length - 1)) / 2 + fallbackLayout.ascent,
  };
}

function SegmentLabel({
  prize,
  lines,
  layout,
  position,
  rotation,
}: {
  prize: WelcomePlayerPrize;
  lines: string[];
  layout: ReturnType<typeof fitSegmentLabel>;
  position: { x: number; y: number };
  rotation: number;
}) {
  return (
    <g transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`} style={{ pointerEvents: "none" }}>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        fill="#fff"
        fontSize={layout.fontSize}
        fontWeight={900}
        letterSpacing="0"
        fontFamily={LABEL_FONT_FAMILY}
        style={{
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.45)",
          strokeWidth: 3,
        }}
      >
        {lines.map((line, lineIndex) => (
          <tspan key={`${prize.id}-${lineIndex}`} x={0} y={layout.firstLineY + lineIndex * layout.lineStep}>
            {line.toUpperCase()}
          </tspan>
        ))}
      </text>
    </g>
  );
}

type WheelSegment = {
  prize: WelcomePlayerPrize;
  path: string;
  label: {
    lines: string[];
    layout: ReturnType<typeof fitSegmentLabel>;
    position: { x: number; y: number };
    rotation: number;
  };
};

const WheelArtwork = memo(function WheelArtwork({ segments }: { segments: WheelSegment[] }) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <circle cx={CENTER} cy={CENTER} r={RADIUS + 16} fill="rgba(255,255,255,0.03)" />
      <g>
        {segments.map(({ prize, path }) => (
          <path key={prize.id} d={path} fill={prize.color} stroke="rgba(255,255,255,0.22)" strokeWidth={4} />
        ))}
      </g>
      <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} fill="rgba(9,11,18,0.98)" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
      <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 18} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
      <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 55} fill="rgba(255,255,255,0.96)" stroke="rgba(255,255,255,0.22)" strokeWidth={4} />
      <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 20} fill="none" stroke="rgba(250,204,21,0.75)" strokeWidth={2} />
      {segments.map(({ prize, label }) => <SegmentLabel key={`label-${prize.id}`} prize={prize} {...label} />)}
    </svg>
  );
});

export default function WelcomePlayersClient() {
  const [config, setConfig] = useState<WelcomePlayersRouletteConfig>(WELCOME_PLAYERS_FALLBACK_CONFIG);
  const prizes = config.prizes;
  const activePrizes = useMemo(() => buildSegments(prizes), [prizes]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadingSpin, setLoadingSpin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState(WELCOME_PLAYERS_DEFAULT_MESSAGE);
  const [attract, setAttract] = useState<WelcomeAttractConfig>(EMPTY_WELCOME_ATTRACT);
  const [showAttract, setShowAttract] = useState(false);
  const [attractFailed, setAttractFailed] = useState(false);
  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    dpr: 1,
    viewportMeta: "",
    breakpoint: "unknown",
    displayMode: "standard" as WelcomePlayersResolvedDisplayMode,
  });
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryConfig, setRetryConfig] = useState(0);
  const configStatusRef = useRef(configStatus);
  configStatusRef.current = configStatus;
  const requestId = useRef<string | null>(null);
  const targetRotation = useRef<number | null>(null);
  const spinPending = useRef(false);
  const finishTimer = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const attractInitialized = useRef(false);
  const interacted = useRef(false);
  const modalVisible = useRef(showModal);
  modalVisible.current = showModal;

  useEffect(() => () => {
    if (finishTimer.current !== null) clearTimeout(finishTimer.current);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const finishSpin = useCallback(() => {
    if (!spinPending.current) return;
    spinPending.current = false;
    if (finishTimer.current !== null) clearTimeout(finishTimer.current);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    finishTimer.current = null;
    setRotation((value) => normalizeAngle(targetRotation.current ?? value));
    targetRotation.current = null;
    requestId.current = null;
    persistPendingSpin(null);
    setSpinning(false);
    setShowModal(true);
    void fetch("/api/welcomeplayers/stats", { cache: "no-store" })
      .then((res) => res.json())
      .then((fresh) => { if (fresh?.ok) setStats(fresh as StatsResponse & { ok: true }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/welcomeplayers/attract", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.ok || cancelled) return;
        const next = data.config as WelcomeAttractConfig;
        setAttract((previous) => previous.enabled === next.enabled && previous.url === next.url && previous.revision === next.revision && previous.mediaType === next.mediaType && previous.imageEffect === next.imageEffect ? previous : next);
        if (!attractInitialized.current) {
          attractInitialized.current = true;
          if (next.enabled && next.url && !interacted.current && !spinPending.current && !modalVisible.current) setShowAttract(true);
        }
        if (!next.enabled || !next.url) setShowAttract(false);
      } catch { /* La ruleta sigue disponible si falla la pantalla de espera. */ }
    };
    const loadMessage = async () => {
      try {
        const response = await fetch("/api/welcomeplayers/message", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok && data?.ok && typeof data.message === "string") setWelcomeMessage(data.message);
      } catch { /* Mantener el último mensaje disponible. */ }
    };
    void load();
    void loadMessage();
    const refresh = () => { if (document.visibilityState === "visible" && !spinPending.current && !modalVisible.current) { void load(); void loadMessage(); } };
    const timer = window.setInterval(refresh, WELCOME_ATTRACT_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => { setAttractFailed(false); }, [attract.url]);
  useEffect(() => {
    const markInteraction = () => { interacted.current = true; };
    window.addEventListener("pointerdown", markInteraction);
    window.addEventListener("keydown", markInteraction);
    return () => { window.removeEventListener("pointerdown", markInteraction); window.removeEventListener("keydown", markInteraction); };
  }, []);
  useEffect(() => {
    if (!attract.enabled || !attract.url || attractFailed || showAttract || spinning || loadingSpin || showModal) return;
    let timer: number;
    const restart = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (!spinPending.current) setShowAttract(true); }, WELCOME_ATTRACT_IDLE_MS); };
    restart();
    window.addEventListener("pointerdown", restart);
    window.addEventListener("keydown", restart);
    return () => { clearTimeout(timer); window.removeEventListener("pointerdown", restart); window.removeEventListener("keydown", restart); };
  }, [attract.enabled, attract.url, attractFailed, showAttract, spinning, loadingSpin, showModal]);

  const wheelSegments = useMemo(
    () =>
      activePrizes.map((prize, index) => {
        const segmentAngle = 360 / Math.max(activePrizes.length, 1);
        const angle = -90 + index * segmentAngle + segmentAngle / 2;
        const lines = splitLabel(prize.label);
        const layout = fitSegmentLabel(lines, segmentAngle);

        return {
          prize,
          path: makeSegmentPath(index, activePrizes.length),
          label: {
            lines,
            layout,
            position: polarToCartesian(CENTER, CENTER, layout.radius, angle),
            rotation: getRadialTextRotation(angle),
          },
        };
      }),
    [activePrizes],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDebugEnabled(params.get("debug") === "1");
  }, []);

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forcedDisplayMode = normalizeWelcomePlayersDisplayMode(params.get("display") || params.get("layout"));

    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
      const displayMode = resolveWelcomePlayersDisplayMode(width, height, forcedDisplayMode);
      const breakpoint =
        displayMode === "kiosk"
          ? "kiosk-portrait"
          : width >= 1280
            ? "xl"
            : width >= 1024
              ? "lg"
              : width >= 768
                ? "md"
                : width >= 640
                  ? "sm"
                  : width >= 480
                    ? "xs-wide"
                    : width >= 430
                      ? "mobile-430"
                      : width >= 390
                        ? "mobile-390"
                        : "mobile-compact";
      setViewport({
        width,
        height,
        dpr: window.devicePixelRatio || 1,
        viewportMeta,
        breakpoint,
        displayMode,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let configInFlight = false;

    const loadConfig = async () => {
      if (configInFlight) return;
      configInFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), WELCOME_PLAYERS_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch("/api/welcomeplayers/config", { cache: "no-store", signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!cancelled && !spinPending.current && !modalVisible.current && res.ok && data?.ok && Array.isArray(data.prizes)) {
          const nextConfig = {
            title: data.title || WELCOME_PLAYERS_DEFAULT_CONFIG.title,
            subtitle: data.subtitle || WELCOME_PLAYERS_DEFAULT_CONFIG.subtitle,
            instructions: data.instructions || WELCOME_PLAYERS_DEFAULT_CONFIG.instructions,
            aspectRatio: data.aspectRatio || WELCOME_PLAYERS_DEFAULT_CONFIG.aspectRatio,
            prizes: data.prizes,
          };
          setConfig((previous) => JSON.stringify(previous) === JSON.stringify(nextConfig) ? previous : nextConfig);
          setConfigStatus("ready");
        } else if (!cancelled && !spinPending.current && !modalVisible.current) {
          setConfigStatus((previous) => previous === "ready" ? previous : "error");
        }
      } catch {
        if (!cancelled) setConfigStatus((previous) => previous === "ready" ? previous : "error");
      } finally {
        clearTimeout(timeout);
        configInFlight = false;
      }
    };

    const loadStats = async () => {
      try {
        const res = await fetch("/api/welcomeplayers/stats", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok) {
          setStats(data as StatsResponse & { ok: true });
        }
      } catch {
        if (!cancelled) setStats(null);
      }
    };

    void loadConfig();
    void loadStats();
    const refresh = () => {
      if (document.visibilityState !== "visible" || spinPending.current || modalVisible.current) return;
      void loadConfig();
      void loadStats();
    };
    const statsTimer = window.setInterval(refresh, WELCOME_PLAYERS_STATS_REFRESH_MS);
    const configTimer = window.setInterval(() => { if (configStatusRef.current !== "ready" && !spinPending.current && !modalVisible.current && document.visibilityState === "visible") void loadConfig(); }, WELCOME_PLAYERS_CONFIG_RETRY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(statsTimer);
      clearInterval(configTimer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [retryConfig]);

  const spin = async () => {
    if (spinning || loadingSpin || spinPending.current) return;
    spinPending.current = true;
    setError(null);
    setLoadingSpin(true);

    try {
      if (!requestId.current) {
        requestId.current = readPendingSpin();
        if (!requestId.current) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          requestId.current = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          persistPendingSpin(requestId.current);
        }
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), WELCOME_PLAYERS_REQUEST_TIMEOUT_MS);
      let response: Response;
      let data: any;
      try {
        response = await fetch("/api/welcomeplayers/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current }), signal: controller.signal });
        data = await response.json().catch(() => null);
      } finally { clearTimeout(timeout); }
      if (!response.ok || !data?.ok) {
        if (response.status === 400) { requestId.current = null; persistPendingSpin(null); }
        throw new Error(data?.message || "No se pudo completar el giro. Toca para reintentar.");
      }

      const payload = data as SpinResponse & { ok: true };
      setResult(payload);
      setSpinning(true);
      setShowModal(false);
      const currentAngle = normalizeAngle(rotation);
      const targetAngle = normalizeAngle(payload.rotation);
      const delta = normalizeAngle(targetAngle - currentAngle);
      const fullRotation = rotation + payload.turns * 360 + delta;
      targetRotation.current = fullRotation;
      finishTimer.current = window.setTimeout(finishSpin, SPIN_DURATION_MS + 2000);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          setRotation(fullRotation);
        });
      });
    } catch (e: any) {
      spinPending.current = false;
      setError(e?.name === "AbortError" || e instanceof TypeError ? "La conexión está demorando. Toca la ruleta para recuperar el mismo giro." : e?.message || "No se pudo completar el giro. Toca para reintentar.");
    } finally {
      setLoadingSpin(false);
    }
  };

  const activePrizeCount = activePrizes.length;
  const canSpin = activePrizeCount >= 3;
  const layout = getWelcomePlayersLayoutProfile(viewport.displayMode);
  const wheelSize = getWelcomePlayersWheelSize(viewport);
  const wheelStyle = { ["--wp-wheel-size"]: `${wheelSize}px` } as CSSProperties;

  return (
    <div className={layout.shellClassName} style={wheelStyle}>
      {debugEnabled ? (
        <div className="absolute left-3 top-3 z-[9998] max-w-[min(92vw,28rem)] rounded-2xl border border-[#41396B] bg-[#111A33] px-4 py-3 font-mono text-[11px] leading-5 text-[#AEB8D4] shadow-lg">
          <div>window.innerWidth: {viewport.width}</div>
          <div>window.innerHeight: {viewport.height}</div>
          <div>window.devicePixelRatio: {viewport.dpr}</div>
          <div>viewport CSS actual: {viewport.viewportMeta || "(default)"}</div>
          <div>breakpoint activo: {viewport.breakpoint}</div>
          <div>modo pantalla: {viewport.displayMode}</div>
        </div>
      ) : null}

      <div className={[layout.stageClassName, "relative z-[2]"].join(" ")}>
        <header className={layout.headerClassName}>
          <img src="/loungewhite.png" alt="Ktdral Lounge" className={layout.logoClassName} />

          <div className={layout.introClassName}>
            <h1 className={layout.titleClassName}>
              Toca <span className="bg-gradient-to-r from-[#FF3CAC] via-[#FF8A3D] to-[#FFD447] bg-clip-text text-transparent">y gana</span>
            </h1>
            <p className={layout.subtitleClassName}>
              Pulsa la pantalla y deja que la ruleta elija tu premio.
            </p>
          </div>
        </header>

        <div className={layout.wheelStageClassName}>
          <div className="relative max-w-full shrink-0" style={wheelStyle}>
          <div className="absolute left-1/2 z-[3] -translate-x-1/2 -translate-y-full" style={{ top: `${((CENTER - RADIUS - 16) / VIEWBOX) * 100}%` }} aria-hidden="true">
            <div className={layout.arrowClassName} />
          </div>

          <button
          type="button"
          className={layout.wheelClassName}
          data-wp-state={spinning || loadingSpin || showModal ? "spinning" : "idle"}
          onClick={spin}
          onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") finishSpin(); }}
          disabled={spinning || loadingSpin || !canSpin}
          aria-label="Girar la ruleta"
            style={{
              transform: `translate3d(0, 0, 0) rotate(${rotation}deg)`,
              transition: spinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.05, 0.14, 1)` : "none",
              willChange: spinning ? "transform" : "auto",
              backfaceVisibility: "hidden",
            }}
          >
            <WheelArtwork segments={wheelSegments} />
            <span className={styles.centerPrompt} aria-hidden="true">{loadingSpin ? <span>ESPERA…</span> : <><span>TOCA</span><span>PARA GIRAR</span></>}</span>
          </button>
          </div>
        </div>

        {configStatus !== "ready" && <section role="status" className="rounded-2xl border border-amber-300/40 bg-[#111A33] px-4 py-4 text-center text-sm text-[#FFD447]">{configStatus === "loading" ? "Preparando la ruleta…" : <>No se pudieron cargar los premios. Reintentaremos automáticamente. <button type="button" className="underline" onClick={() => { setConfigStatus("loading"); setRetryConfig((value) => value + 1); }}>Reintentar ahora</button></>}</section>}
        {loadingSpin && <p role="status" className="text-center text-sm text-white">Preparando tu giro, espera un momento…</p>}
        {error && <div role="alert" className="rounded-2xl border border-red-400/50 bg-red-950/50 px-4 py-3 text-center text-sm text-red-200">{error}</div>}
        {configStatus === "ready" && !canSpin && (
          <section className="rounded-[1.25rem] border border-amber-300/40 bg-[#111A33] px-4 py-4 text-center text-sm leading-relaxed text-[#FFD447] shadow-sm">
            Necesitamos al menos <span className="font-semibold">3 premios activos</span> para activar la ruleta.
            Agrega más premios desde coordinación y vuelve a intentarlo.
          </section>
        )}


        <div className="grid grid-cols-2 gap-3">
          <StatCard label="GIROS · JORNADA" value={stats?.totalSpins ?? "—"} className={layout.statsCardClassName} />
          <StatCard label="PREMIOS" value={stats?.activePrizes ?? activePrizeCount} className={layout.statsCardClassName} />
        </div>


        {stats?.lastPrize && (
          <section className="rounded-[1.25rem] border border-[#41396B] bg-[#111A33] px-4 py-4 text-sm text-[#AEB8D4] shadow-sm">
            Último premio obtenido: <span className="font-semibold text-[#FFD447]">{stats.lastPrize.label}</span>
          </section>
        )}

        <footer className={layout.footerClassName}>
          <span className="inline-flex items-center gap-4">
            <span className="h-px w-12 bg-white/15" />
            <span>{welcomeMessage}</span>
            <span className="h-px w-12 bg-white/15" />
          </span>
        </footer>
      </div>

      {showModal && result && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Cerrar modal"
            onClick={() => setShowModal(false)}
          />
          <div className={layout.modalClassName}>
            <div className="mx-auto h-1 w-24 rounded-full bg-gradient-to-r from-[#FF3CAC] to-[#18D7FF]" />
            <p className="mt-5 text-[0.72rem] font-semibold uppercase tracking-[0.38em] text-[#FFD447]">¡GANASTE!</p>
            <h3 className={layout.modalTitleClassName}>
              {result.prize.label}
            </h3>
            <p className={layout.modalCopyClassName}>
              Disfruta tu recompensa y vacílate en #KtdralLounge.
            </p>
            <button
              type="button"
              className={layout.modalButtonClassName}
              onClick={() => setShowModal(false)}
            >
              CERRAR
            </button>
          </div>
        </div>
      )}
      {showAttract && attract.enabled && attract.url && !attractFailed && (
        <button type="button" aria-label="Toca para jugar" onClick={() => { interacted.current = true; setShowAttract(false); }} className="fixed inset-0 z-[9999] h-[100dvh] w-full overflow-hidden bg-slate-950 text-white">
          {attract.mediaType === "video" ? <video key={attract.url} src={attract.url} autoPlay muted loop playsInline onError={() => { setAttractFailed(true); setShowAttract(false); }} className="absolute inset-0 h-full w-full object-contain" /> : <><img key={attract.url} src={attract.url} alt="" onError={() => { setAttractFailed(true); setShowAttract(false); }} className={`absolute inset-0 h-full w-full object-contain ${attract.imageEffect === "bounce" ? attractEffects.bounce : attract.imageEffect === "heartbeat" ? attractEffects.heartbeat : ""}`} />{attract.imageEffect === "lights" && <span aria-hidden="true" className={`absolute inset-0 ${attractEffects.lights}`} />}</>}
          <span className="sr-only">Toca para jugar</span>
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className={className || "rounded-[1.5rem] border border-[#41396B] bg-[#111A33] px-4 py-5 text-center shadow-sm"}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#AEB8D4]">{label}</div>
      <div className="mt-2 text-[clamp(2.6rem,5vw,3.4rem)] font-black leading-none text-[#F5F7FF]">{value}</div>
    </div>
  );
}
