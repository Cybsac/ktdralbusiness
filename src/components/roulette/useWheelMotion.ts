import { useEffect, useRef, useState } from 'react';
import { ROULETTE_SPIN_DURATION_MS, SPIN_KEYFRAME_COUNT, sampledSpinProgress, spinProgress, wheelTargetRotation, wheelTransform } from './motion';
import type { RouletteElement } from './types';
import type { RouletteQuality } from './motion';
import { ROULETTE_CONFIG } from '@/lib/experiences/roulette-config';

interface Options {
  spinning: boolean;
  prizeIndex: number | null;
  elements: RouletteElement[];
  reduced: boolean;
  quality: RouletteQuality;
  onStart?: () => void;
  onTick?: () => void;
  onEnd: (prize: RouletteElement) => void;
}

/** Freeze the winning index, curve and duration for the life of one spin. */
export function useWheelMotion(options: Options) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<SVGSVGElement>(null);
  const rotation = useRef(0);
  const latest = useRef(options);
  latest.current = options;
  const [moving, setMoving] = useState(false);
  const { spinning, prizeIndex } = options;

  useEffect(() => {
    const wheel = wheelRef.current;
    const { elements, reduced, quality } = latest.current;
    if (!spinning || prizeIndex === null || !wheel || !elements[prizeIndex]) return;
    const prize = elements[prizeIndex];
    const from = rotation.current;
    const to = wheelTargetRotation(from, prizeIndex, elements.length, reduced);
    const duration = reduced ? ROULETTE_SPIN_DURATION_MS.lowMotion : ROULETTE_SPIN_DURATION_MS.normal;
    const segmentAngle = 360 / elements.length;
    const started = performance.now();
    let animation: Animation | undefined;
    let pointerAnimation: Animation | undefined;
    let frame = 0;
    let done = false;
    let lastSector = Math.floor(from / segmentAngle);
    let lastClick = -Infinity;
    let lastPointer = -Infinity;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(watchdog);
      wheel.style.transform = wheelTransform(to % 360);
      rotation.current = to % 360;
      animation?.cancel();
      pointerAnimation?.cancel();
      setMoving(false);
      latest.current.onEnd(prize);
    };
    const tuning = ROULETTE_CONFIG.motion;
    const watchdog = window.setTimeout(finish, duration + tuning.watchdogMs);
    setMoving(true);
    if (typeof wheel.animate === 'function') {
      try {
        animation = wheel.animate(Array.from({ length: SPIN_KEYFRAME_COUNT + 1 }, (_, i) => {
          const offset = i / SPIN_KEYFRAME_COUNT;
          return { offset, transform: wheelTransform(from + (to - from) * spinProgress(offset, reduced)) };
        }), { duration, easing: 'linear', fill: 'forwards' });
        animation.onfinish = finish;
      } catch { /* Older browsers use the same curve through rAF. */ }
    }
    latest.current.onStart?.();

    const tick = (now: number) => {
      if (done || document.hidden) return;
      const elapsed = typeof animation?.currentTime === 'number' ? animation.currentTime : now - started;
      if (elapsed >= duration) { finish(); return; }
      const angle = from + (to - from) * sampledSpinProgress(elapsed / duration, reduced);
      if (!animation) wheel.style.transform = wheelTransform(angle);
      const sector = Math.floor(angle / segmentAngle);
      if (!reduced && sector !== lastSector) {
        if (now - lastClick >= tuning.tickIntervalMs) {
          latest.current.onTick?.();
          lastClick = now;
        }
        const pointer = pointerRef.current;
        if (quality !== 'low' && pointer?.animate && now - lastPointer >= tuning.pointerIntervalMs) {
          pointerAnimation?.cancel();
          try {
            pointerAnimation = pointer.animate([
              { transform: 'translateX(-50%) rotate(0deg)' },
              { transform: `translateX(-50%) rotate(${tuning.pointerTiltDeg}deg)`, offset: 0.3 },
              { transform: 'translateX(-50%) rotate(0deg)' },
            ], { duration: tuning.pointerIntervalMs, easing: 'ease-out' });
          } catch { /* The wheel can continue if an SVG animation is unsupported. */ }
          lastPointer = now;
        }
      }
      lastSector = sector;
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (document.hidden) pointerAnimation?.cancel();
      if (!document.hidden && !done) {
        // Never replay missed clicks after the tab becomes visible.
        const elapsed = typeof animation?.currentTime === 'number' ? animation.currentTime : performance.now() - started;
        lastSector = Math.floor((from + (to - from) * sampledSpinProgress(elapsed / duration, reduced)) / segmentAngle);
        if (elapsed >= duration) finish();
        else frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    if (!document.hidden) frame = requestAnimationFrame(tick);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(watchdog);
      document.removeEventListener('visibilitychange', visibility);
      animation?.cancel();
      pointerAnimation?.cancel();
      setMoving(false);
    };
  }, [spinning, prizeIndex]);

  return { wheelRef, pointerRef, moving };
}
