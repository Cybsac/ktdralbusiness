// Shared color generation without business-module dependencies.
export const PRIZE_COLOR_POLICY = {
  recentColors: 12,
  hueCandidates: 72,
  saturation: 0.7,
  lightness: 0.48,
} as const;
function rgb(hex: string): number[] | null {
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  const normalized = short ? `#${[...short[1]].map((c) => c + c).join("")}` : hex;
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return null;
  return [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}
// OKLab distance approximates perceived color difference rather than hex difference.
function lab(channels: number[]) {
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function candidate(hue: number) {
  const { saturation: s, lightness: l } = PRIZE_COLOR_POLICY;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  });
}
export function choosePrizeColor(recent: Array<string | null>) {
  const previous = recent.slice(0, PRIZE_COLOR_POLICY.recentColors).flatMap((color) => {
    const parsed = color ? rgb(color) : null;
    return parsed ? [lab(parsed)] : [];
  });
  let best = candidate(0),
    bestDistance = -1;
  for (let i = 0; i < PRIZE_COLOR_POLICY.hueCandidates; i++) {
    const color = candidate((i * 360) / PRIZE_COLOR_POLICY.hueCandidates);
    const point = lab(color.map((c) => c / 255));
    const distance = previous.length
      ? Math.min(
          ...previous.map((other) =>
            point.reduce((sum, value, axis) => sum + (value - other[axis]) ** 2, 0)
          )
        )
      : 1;
    if (distance > bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return `#${best
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
