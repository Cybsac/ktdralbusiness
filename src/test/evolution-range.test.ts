import { describe, expect, it } from 'vitest';
import { evolutionRange } from '@/lib/evolution-range';

describe('intervalos de evolución', () => {
  it('incluye ambos extremos, incluso a través de meses y años', () => {
    expect(evolutionRange('2025-12-31', '2026-01-02', 366)).toEqual({ start: '2025-12-31', end: '2026-01-02', days: 3 });
    expect(evolutionRange('2026-03-01', '2026-03-01', 366)?.days).toBe(1);
  });
  it('rechaza fechas inexistentes, invertidas o que superan el límite', () => {
    expect(evolutionRange('2026-02-30', '2026-03-01', 366)).toBeNull();
    expect(evolutionRange('2026-03-02', '2026-03-01', 366)).toBeNull();
    expect(evolutionRange('2026-01-01', '2026-01-03', 2)).toBeNull();
  });
});
