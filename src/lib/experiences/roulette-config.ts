/** Presentation tuning only. The server remains authoritative for game results. */
export const ROULETTE_CONFIG = {
  requestTimeoutMs: 12_000,
  loadBudgetMs: 2_500,
  sidebar: { timeoutMs: 5_000, refreshMs: 30_000, desktopRotationMs: 12_000, mobileRotationMs: 3_200, visibleSlots: 3 },
  perfSampleRate: 0.15,
  defaultQuality: 'medium',
  motion: { durationMs: 4_800, reducedDurationMs: 900, fullRotations: 5, keyframeCount: 96, accelerateUntil: 0.12, brakeFrom: 0.32, watchdogMs: 350, tickIntervalMs: 35, pointerIntervalMs: 90, pointerTiltDeg: 7 },
  result: { modalDelayMs: 500, scratchModalDelayMs: 1_500, scratchRevealDelayMs: 900, soundDelayMs: 300, loseRedirectMs: 3_200 },
  device: { compactMedia: '(max-width: 1023px), (pointer: coarse)', lowMemoryGB: 2, lowCores: 2, highMemoryGB: 8, highCores: 8, scratchSmallWidth: 380, scratchSmallHeight: 680 },
  quality: {
    low: { particles: 28, pixelRatio: 1, lightStride: 0 },
    medium: { particles: 60, pixelRatio: 1.5, lightStride: 3 },
    high: { particles: 160, pixelRatio: 2, lightStride: 1 },
  },
  frame: { lightCount: 36, idleCycleSeconds: 1.2, chaseSeconds: 1.5 },
  audio: {
    fadeFloor: 0.001,
    start: [{ from: 200, to: 800, duration: 0.1, gain: 0.3 }],
    tick: [{ from: 750, to: 180, duration: 0.03, gain: 0.12, type: 'triangle' }],
    stop: [{ from: 600, to: 200, duration: 0.3, gain: 0.4 }],
    win: [523, 659, 784, 1047].map((frequency, index) => ({ from: frequency, to: frequency, duration: 0.2, gain: 0.3, offset: index * 0.1 })),
    lose: [{ from: 400, to: 150, duration: 0.8, gain: 0.2 }],
  },
} as const;
