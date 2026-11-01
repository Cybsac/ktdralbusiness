// Stable, high-contrast palette. Existing group colors are never changed.
export const GROUP_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c026d3'] as const;

export function chooseGroupColor(existing: Array<string | null>): string {
  const counts = new Map<string, number>(GROUP_COLORS.map(color => [color, 0]));
  for (const value of existing) {
    const color = value?.toLowerCase();
    if (color && counts.has(color)) counts.set(color, counts.get(color)! + 1);
  }
  return GROUP_COLORS.reduce((best, color) => counts.get(color)! < counts.get(best)! ? color : best);
}
