"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ScratchEngineOptions, ScratchEngineState } from "./scratchTypes";
import { drawCoating } from "./drawCoating";
import { SCRATCH_VISUAL_CONFIG } from "./scratchVisualConfig";

const DEFAULTS = { revealThreshold: SCRATCH_VISUAL_CONFIG.revealThreshold, ...SCRATCH_VISUAL_CONFIG.interaction };

export function useScratchEngine(onReveal: () => void, disabled: boolean, options: ScratchEngineOptions = {}, onScratch?: () => void) {
  const settings = { ...DEFAULTS, ...options };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false); const completedRef = useRef(false); const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const samplesRef = useRef<Uint8Array | null>(null); const sampleSizeRef = useRef({ width: 0, height: 0 });
  const boundsRef = useRef({ minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 });
  const cardSizeRef = useRef({ width: 1, height: 1 });
  const [state, setState] = useState<ScratchEngineState>({ progress: 0, scratching: false, completed: false });

  const updateCoverage = useCallback(() => {
    const sample = samplesRef.current; if (!sample) return;
    let cleared = 0; for (const value of sample) cleared += value;
    const areaCoverage = cleared / sample.length;
    const bounds = boundsRef.current; const card = cardSizeRef.current;
    const gestureCoverage = Number.isFinite(bounds.minX)
      ? Math.min(1, ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) / (card.width * card.height))
      : 0;
    const progress = Math.min(1, areaCoverage * SCRATCH_VISUAL_CONFIG.coverage.areaWeight + gestureCoverage * SCRATCH_VISUAL_CONFIG.coverage.gestureWeight);
    setState((current) => ({ ...current, progress, scratching: true }));
    if (progress >= settings.revealThreshold && areaCoverage >= SCRATCH_VISUAL_CONFIG.coverage.minimumArea && !completedRef.current) {
      completedRef.current = true;
      setState({ progress, scratching: false, completed: true });
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(onReveal, reducedMotion ? 0 : 350);
    }
  }, [onReveal, settings.revealThreshold]);

  const paint = useCallback((from: { x: number; y: number } | null, to: { x: number; y: number }, radius: number) => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect(); const distance = from ? Math.hypot(to.x - from.x, to.y - from.y) : 0; const steps = Math.max(1, Math.ceil(distance / Math.max(4, radius * 0.45)));
    onScratch?.();
    cardSizeRef.current = { width: rect.width, height: rect.height };
    const localPoint = { x: to.x - rect.left, y: to.y - rect.top };
    boundsRef.current.minX = Math.min(boundsRef.current.minX, localPoint.x); boundsRef.current.minY = Math.min(boundsRef.current.minY, localPoint.y); boundsRef.current.maxX = Math.max(boundsRef.current.maxX, localPoint.x); boundsRef.current.maxY = Math.max(boundsRef.current.maxY, localPoint.y);
    const pixelRatio = canvas.width / rect.width;
    ctx.save(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); ctx.globalCompositeOperation = "destination-out"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = radius * 2; ctx.beginPath();
    ctx.moveTo((from?.x ?? to.x) - rect.left, (from?.y ?? to.y) - rect.top);
    for (let step = 1; step <= steps; step += 1) { const amount = step / steps; ctx.lineTo(((from ? from.x + (to.x - from.x) * amount : to.x) - rect.left), ((from ? from.y + (to.y - from.y) * amount : to.y) - rect.top)); }
    ctx.stroke(); ctx.restore();
    const sample = samplesRef.current; const sampleSize = sampleSizeRef.current; if (!sample) return;
    const scaleX = sampleSize.width / rect.width; const scaleY = sampleSize.height / rect.height; const sampleRadius = radius * Math.max(scaleX, scaleY);
    for (let step = 0; step <= steps; step += 1) {
      const amount = steps === 0 ? 1 : step / steps;
      const localX = ((from ? from.x + (to.x - from.x) * amount : to.x) - rect.left);
      const localY = ((from ? from.y + (to.y - from.y) * amount : to.y) - rect.top);
      const minX = Math.max(0, Math.floor((localX - sampleRadius) * scaleX)); const maxX = Math.min(sampleSize.width - 1, Math.ceil((localX + sampleRadius) * scaleX));
      const minY = Math.max(0, Math.floor((localY - sampleRadius) * scaleY)); const maxY = Math.min(sampleSize.height - 1, Math.ceil((localY + sampleRadius) * scaleY));
      for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) if (Math.hypot(x / scaleX - localX, y / scaleY - localY) <= radius) sample[y * sampleSize.width + x] = 1;
    }
  }, [onScratch]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const previous = samplesRef.current; const previousSize = sampleSizeRef.current;
      const pixelRatio = Math.min(settings.maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(rect.width * pixelRatio); canvas.height = Math.round(rect.height * pixelRatio); drawCoating(canvas, rect.width, rect.height, pixelRatio);
      const nextSize = { width: Math.max(1, Math.floor(rect.width / 8)), height: Math.max(1, Math.floor(rect.height / 8)) };
      const next = new Uint8Array(nextSize.width * nextSize.height);
      if (previous) {
        const ctx = canvas.getContext("2d");
        if (ctx && previousSize.width && previousSize.height) {
          const pixelRatio = canvas.width / rect.width;
          ctx.save(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); ctx.globalCompositeOperation = "destination-out";
          for (let y = 0; y < nextSize.height; y += 1) for (let x = 0; x < nextSize.width; x += 1) {
            const oldX = Math.min(previousSize.width - 1, Math.floor(x * previousSize.width / nextSize.width));
            const oldY = Math.min(previousSize.height - 1, Math.floor(y * previousSize.height / nextSize.height));
            if (previous[oldY * previousSize.width + oldX]) { next[y * nextSize.width + x] = 1; ctx.beginPath(); ctx.arc((x + .5) * 8, (y + .5) * 8, 5, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.restore();
        }
      }
      sampleSizeRef.current = nextSize; samplesRef.current = next;
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("orientationchange", resize, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener("orientationchange", resize); samplesRef.current = null; lastPointRef.current = null; boundsRef.current = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 }; };
  }, [settings.maxPixelRatio]);

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (disabled || completedRef.current) return; drawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); const point = { x: event.clientX, y: event.clientY }; lastPointRef.current = point; paint(null, point, event.pointerType === "mouse" ? settings.mouseBrushSize : settings.touchBrushSize); updateCoverage(); };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawingRef.current || disabled || completedRef.current) return; const point = { x: event.clientX, y: event.clientY }; paint(lastPointRef.current, point, event.pointerType === "mouse" ? settings.mouseBrushSize : settings.touchBrushSize); lastPointRef.current = point; updateCoverage(); };
  const stop = () => { drawingRef.current = false; lastPointRef.current = null; setState((current) => ({ ...current, scratching: false })); };
  return { canvasRef, state, pointerDown, pointerMove, stop };
}
