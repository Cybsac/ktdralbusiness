export type EvolutionChartRow = { start: string; end: string; values: Record<string, number> };

/** Group daily points for readability while retaining the exact selected boundaries. */
export function groupEvolutionRows(rows: EvolutionChartRow[], daily: boolean): EvolutionChartRow[] {
  if (!daily || rows.length <= 31) return rows;
  const monthly = rows.length > 120;
  const groups = new Map<string, EvolutionChartRow>();
  for (const row of rows) {
    const date = new Date(`${row.start}T12:00:00.000Z`);
    if (!monthly) date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monthly ? row.start.slice(0, 7) : date.toISOString().slice(0, 10);
    let group = groups.get(key);
    if (!group) { group = { start: row.start, end: row.end, values: {} }; groups.set(key, group); }
    group.end = row.end;
    for (const [name, value] of Object.entries(row.values)) group.values[name] = (group.values[name] || 0) + value;
  }
  return Array.from(groups.values());
}

export function evolutionChartLabel(row: EvolutionChartRow): string {
  const format = (day: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00.000Z`));
  return row.start === row.end ? format(row.start) : `${format(row.start)} – ${format(row.end)}`;
}
