import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROULETTE_SPIN_DURATION_MS, rouletteQuality, sampledSpinProgress, spinProgress, wheelTargetRotation } from '../../src/components/roulette/motion';
import { revealGameResult } from '../../src/lib/prize-games/client';

vi.mock('@/lib/prize-authorization/client', () => ({ prizeAuthorizedFetch: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const normalize = (angle: number) => ((angle % 360) + 360) % 360;

describe('public roulette motion', () => {
  it('lands at the centre of every server-selected segment from any starting angle', () => {
    for (const count of [2, 3, 5, 6, 12, 20]) {
      for (let index = 0; index < count; index++) {
        for (const current of [0, 73.5, -40, 359, 2250]) {
          const expected = normalize(360 - (index + 0.5) * 360 / count);
          const target = wheelTargetRotation(current, index, count, false);
          expect(normalize(target)).toBeCloseTo(expected, 8);
          expect(target - current).toBeGreaterThanOrEqual(1800);
          const reduced = wheelTargetRotation(current, index, count, true);
          expect(normalize(reduced)).toBeCloseTo(expected, 8);
          expect(Math.abs(reduced - current)).toBeLessThanOrEqual(180);
        }
      }
    }
  });

  it('accelerates, cruises and decelerates with no backward jumps', () => {
    for (const reduced of [false, true]) {
      expect(sampledSpinProgress(0, reduced)).toBe(0);
      expect(sampledSpinProgress(1, reduced)).toBeCloseTo(1, 10);
      for (let i = 1; i <= 1000; i++) {
        expect(sampledSpinProgress(i / 1000, reduced)).toBeGreaterThanOrEqual(sampledSpinProgress((i - 1) / 1000, reduced));
      }
    }
    const velocity = (t: number) => (spinProgress(t + 0.005) - spinProgress(t)) / 0.005;
    expect(velocity(0.02)).toBeLessThan(velocity(0.1));
    expect(velocity(0.2)).toBeCloseTo(velocity(0.27));
    expect(velocity(0.5)).toBeGreaterThan(velocity(0.8));
    expect(velocity(0.95)).toBeLessThan(0.03);
    expect(ROULETTE_SPIN_DURATION_MS.normal).toBe(4800);
  });

  it('defaults compact devices to medium without conflating preference and performance', () => {
    expect(rouletteQuality(undefined, undefined, true)).toBe('medium');
    expect(rouletteQuality(4, 8, true)).toBe('medium');
    expect(rouletteQuality(2, 8, false)).toBe('low');
    expect(rouletteQuality(8, 2, true)).toBe('low');
    expect(rouletteQuality(8, 8, true)).toBe('medium');
    expect(rouletteQuality(8, 8, false)).toBe('high');
  });

  it('passes cancellation through without retrying an ambiguous reveal mutation', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    await expect(revealGameResult('token', 'Error', controller.signal)).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toEqual({ method: 'POST', signal: controller.signal });
  });
});
