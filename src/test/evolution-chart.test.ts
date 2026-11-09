import { describe, expect, it } from 'vitest';
import { groupEvolutionRows, type EvolutionChartRow } from '@/lib/evolution-chart';

function days(start: string, count: number): EvolutionChartRow[] {
  const first = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first); date.setUTCDate(date.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    return { start: day, end: day, values: { total: 1, second: 2 } };
  });
}
describe('agrupación de gráficos de evolución', () => {
  it('mantiene días cortos y períodos semanales sin cambios', () => {
    const rows = days('2026-01-01', 31);
    expect(groupEvolutionRows(rows, true)).toEqual(rows);
    expect(groupEvolutionRows(days('2026-01-01', 40), false)).toHaveLength(40);
  });
  it('agrupa por semanas respetando los extremos parciales y los totales', () => {
    const grouped = groupEvolutionRows(days('2026-01-01', 40), true);
    expect(grouped[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-04', values: { total: 4, second: 8 } });
    expect(grouped.at(-1)?.end).toBe('2026-02-09');
    expect(grouped.reduce((sum, row) => sum + row.values.total, 0)).toBe(40);
  });
  it('agrupa rangos largos por meses sin añadir días', () => {
    const grouped = groupEvolutionRows(days('2025-12-20', 121), true);
    expect(grouped[0]).toMatchObject({ start: '2025-12-20', end: '2025-12-31', values: { total: 12 } });
    expect(grouped.at(-1)?.end).toBe('2026-04-19');
    expect(grouped.reduce((sum, row) => sum + row.values.total, 0)).toBe(121);
  });
});
