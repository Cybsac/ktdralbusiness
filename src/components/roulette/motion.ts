/** A single duration is shared by the wheel transition, completion timer and audio. */
export const ROULETTE_SPIN_DURATION_MS = { normal: 6000, lowMotion: 3500 } as const;
const FULL_ROTATIONS = { normal: 5, lowMotion: 3 } as const;

/** End with the winning segment centred below the pointer. */
export function wheelTargetRotation(current: number, index: number, segmentCount: number, lowMotion: boolean) {
  const angle = 360 / segmentCount;
  const target = 360 - (index * angle + angle / 2);
  const difference = (target - (current % 360) + 360) % 360;
  return current + FULL_ROTATIONS[lowMotion ? 'lowMotion' : 'normal'] * 360 + difference;
}
