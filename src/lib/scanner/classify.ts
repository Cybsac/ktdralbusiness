/** Recognizes app-issued QR formats without validating or consuming them. */
export const SCANNER_REPEAT_GAP_MS = 1500;
export type ScannerObservation = { text: string; at: number } | null;
/** A QR held in front of the camera must disappear before it can be processed again. */
export function observeScannerCode(previous: ScannerObservation, text: string, now: number, blocked: boolean) {
  if (previous?.text === text && now - previous.at < SCANNER_REPEAT_GAP_MS) return { accept: false, lastSeen: { text, at: now } };
  if (blocked) return { accept: false, lastSeen: previous };
  return { accept: true, lastSeen: { text, at: now } };
}
export type ScannerTarget =
  | { kind: 'page'; label: string; href: string }
  | { kind: 'custom'; code: string }
  | { kind: 'servicePoint'; label: string; location: string; active: boolean }
  | { kind: 'ticket'; code: string; package: boolean };

const PAGE_ROUTES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^\/r\/[^/]+\/?$/i, label: 'Pulsera TokenShow' },
  { pattern: /^\/redeem\/[^/]+\/?$/i, label: 'Pulsera TokenShow' },
  { pattern: /^\/static\/[^/]+\/?$/i, label: 'Token interactivo' },
  { pattern: /^\/s\/[^/]+\/?$/i, label: 'Token interactivo' },
  { pattern: /^\/reusable\/[^/]+\/?$/i, label: 'Token reutilizable' },
  { pattern: /^\/b\/[^/]+\/?$/i, label: 'Cumpleaños' },
  { pattern: /^\/i\/[^/]+\/?$/i, label: 'Invitación' },
  { pattern: /^\/menu\/?$/i, label: 'Carta' },
  { pattern: /^\/reservatucumple\/[^/]+\/?$/i, label: 'Reserva de cumpleaños' },
];

export function classifyScannerTarget(input: string, origin: string): ScannerTarget | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^TICKET_[A-Z0-9_-]+$/i.test(raw)) return { kind: 'ticket', code: raw, package: false };
  if (/^PKG-[A-Z0-9-]+$/i.test(raw)) return { kind: 'ticket', code: raw, package: true };
  if (/^rt_[a-z0-9]+$/i.test(raw)) return { kind: 'page', label: 'Token reutilizable', href: `/reusable/${encodeURIComponent(raw)}` };
  if (/^M26_[A-Z0-9]+$/i.test(raw)) return { kind: 'page', label: 'Jugada Mundial 2026', href: `/u/mundial2026/scan?scan=${encodeURIComponent(raw)}` };
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object') {
      if (value.type === 'mundial2026_prediction' && typeof value.qrCode === 'string') return { kind: 'page', label: 'Jugada Mundial 2026', href: `/u/mundial2026/scan?scan=${encodeURIComponent(raw)}` };
      if (value.payload?.t === 'birthday' && typeof value.payload.code === 'string' && typeof value.sig === 'string') return { kind: 'page', label: 'Cumpleaños', href: `/b/${encodeURIComponent(value.payload.code)}` };
    }
  } catch { /* Not a structured QR. */ }
  try {
    const url = new URL(raw, origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const path = url.pathname;
    const custom = path.match(/^\/sorteos-qr\/([^/]+)\/?$/i);
    if (custom) return { kind: 'custom', code: decodeURIComponent(custom[1]) };
    const fanzone = path.match(/^\/(?:mundial2026\/)?fanzone\/([^/]+)\/?$/i);
    if (fanzone) return { kind: 'page', label: 'Fan Zone Mundial 2026', href: `/admin/mundial2026/fanzone/${encodeURIComponent(decodeURIComponent(fanzone[1]))}` };
    if (/^\/mundial2026\/jugada\/[^/]+\/?$/i.test(path)) return { kind: 'page', label: 'Jugada Mundial 2026', href: `/u/mundial2026/scan?scan=${encodeURIComponent(raw)}` };
    if (path === '/marketing/ruleta' && url.searchParams.has('tokenId')) return { kind: 'page', label: 'Pulsera TokenShow', href: path + url.search + url.hash };
    const route = PAGE_ROUTES.find(item => item.pattern.test(path));
    if (route) return { kind: 'page', label: route.label, href: path + url.search + url.hash };
  } catch { /* Invalid URL or encoding. */ }
  return null;
}
