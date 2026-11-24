import { ROULETTE_CONFIG } from '@/lib/experiences/roulette-config';

export const ROULETTE_SPIN_DURATION_MS = { normal: ROULETTE_CONFIG.motion.durationMs, lowMotion: ROULETTE_CONFIG.motion.reducedDurationMs } as const;
export type RouletteQuality = 'low' | 'medium' | 'high';

/** Mobile is medium by default. Screen size never determines reduced motion. */
export function rouletteQuality(memory?: number, cores?: number, compact = true): RouletteQuality {
  const device = ROULETTE_CONFIG.device;
  if ((memory && memory <= device.lowMemoryGB) || (cores && cores <= device.lowCores)) return 'low';
  if (!compact && (memory ?? 0) >= device.highMemoryGB && (cores ?? 0) >= device.highCores) return 'high';
  return ROULETTE_CONFIG.defaultQuality;
}

/** End with the winning segment centred below the pointer. */
export function wheelTargetRotation(current: number, index: number, segmentCount: number, lowMotion: boolean) {
  const angle = 360 / segmentCount;
  const target = 360 - (index * angle + angle / 2);
  const difference = ((target - current) % 360 + 360) % 360;
  if (lowMotion) return current + (difference > 180 ? difference - 360 : difference);
  return current + ROULETTE_CONFIG.motion.fullRotations * 360 + difference;
}

/** Integral of an acceleration / cruise / deceleration velocity profile. */
export function spinProgress(time: number, reduced = false): number {
  const t = Math.max(0, Math.min(1, time));
  if (reduced) return t * t * (3 - 2 * t);
  const acceleration = ROULETTE_CONFIG.motion.accelerateUntil;
  const brake = ROULETTE_CONFIG.motion.brakeFrom;
  const tail = 1 - brake;
  const area = acceleration / 2 + (brake - acceleration) + tail / 3;
  if (t < acceleration) return (t * t / (2 * acceleration)) / area;
  if (t < brake) return (acceleration / 2 + t - acceleration) / area;
  const u = (t - brake) / tail;
  return Math.min(1, (acceleration / 2 + brake - acceleration + tail * (u - u * u + u * u * u / 3)) / area);
}

export const SPIN_KEYFRAME_COUNT = ROULETTE_CONFIG.motion.keyframeCount;

/** The tick clock uses the exact same sampled curve as the compositor. */
export function sampledSpinProgress(time: number, reduced = false): number {
  const sample = Math.max(0, Math.min(1, time)) * SPIN_KEYFRAME_COUNT;
  const i = Math.floor(sample);
  const a = spinProgress(i / SPIN_KEYFRAME_COUNT, reduced);
  const b = spinProgress(Math.min(i + 1, SPIN_KEYFRAME_COUNT) / SPIN_KEYFRAME_COUNT, reduced);
  return a + (b - a) * (sample - i);
}

export function wheelTransform(rotation: number): string {
  return `translateZ(0) rotate(${rotation}deg)`;
}
