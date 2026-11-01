type Prize = { label: string; color: string | null } | null;
type InteractiveToken = { deliveredAt: Date | null; revealedAt: Date | null; expiresAt: Date; validFrom: Date | null; disabled: boolean; prize: Prize };
type PrizeCount = { label: string; color: string | null; count: number };

function groupPrizes(tokens: InteractiveToken[]): PrizeCount[] {
  const groups = new Map<string, PrizeCount>();
  for (const token of tokens) {
    const label = token.prize?.label ?? 'Sin premio';
    const group = groups.get(label);
    if (group) group.count++;
    else groups.set(label, { label, color: token.prize?.color ?? null, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** As of the selected business-day cutoff; opening stock is fixed for the day. */
export function interactiveMetrics(tokens: InteractiveToken[], start: Date, cutoff: Date) {
  const beforeCutoff = (date: Date | null) => date !== null && date < cutoff;
  const redeemed = tokens.filter(token => beforeCutoff(token.deliveredAt));
  const pending = tokens.filter(token => !beforeCutoff(token.deliveredAt));
  const disabled = pending.filter(token => token.disabled);
  const expired = pending.filter(token => !token.disabled && token.expiresAt < cutoff);
  const upcoming = pending.filter(token => !token.disabled && token.expiresAt >= cutoff && token.validFrom !== null && token.validFrom > cutoff);
  const active = pending.filter(token => !token.disabled && token.expiresAt >= cutoff && (token.validFrom === null || token.validFrom <= cutoff));
  const available = active.filter(token => !beforeCutoff(token.revealedAt));
  const circulating = active.filter(token => beforeCutoff(token.revealedAt));
  const delivered = tokens.filter(token => token.deliveredAt !== null && token.deliveredAt >= start && token.deliveredAt < cutoff);
  return {
    total: tokens.length,
    available: available.length,
    availablePrizes: groupPrizes(available),
    unavailable: disabled.length + expired.length + upcoming.length,
    disabled: disabled.length,
    expired: expired.length,
    upcoming: upcoming.length,
    redeemed: redeemed.length,
    redeemedPrizes: groupPrizes(redeemed),
    inCirculation: circulating.length,
    circulationPrizes: groupPrizes(circulating),
    deliveredToday: delivered.length,
    deliveredPrizes: groupPrizes(delivered),
  };
}

/** Groups each day's deliveries by prize and named operator without exposing user IDs. */
export function deliveryOperators(
  tokens: Array<{ deliveredAt: Date | null; deliveredByUserId: string | null; prize: Prize }>,
  start: Date,
  cutoff: Date,
  names: ReadonlyMap<string, string>,
) {
  const prizes = new Map<string, Map<string, number>>();
  for (const token of tokens) {
    if (!token.deliveredAt || token.deliveredAt < start || token.deliveredAt >= cutoff) continue;
    const label = token.prize?.label ?? 'Sin premio';
    const name = (token.deliveredByUserId && names.get(token.deliveredByUserId)) || 'Usuario no disponible';
    const operators = prizes.get(label) ?? new Map<string, number>();
    operators.set(name, (operators.get(name) ?? 0) + 1);
    prizes.set(label, operators);
  }
  return new Map([...prizes].map(([label, operators]) => [label,
    [...operators].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
  ]));
}
