const EMERGENCY_COOKIE_NAME = 'app_access_emergency';
const EMERGENCY_COOKIE_TTL_SECONDS = 15 * 60;
const EMERGENCY_TOKEN_PREFIX = 'app-access-emergency.v1';

function getEmergencySecret(): string | null {
  const configured = process.env.APP_ACCESS_EMERGENCY_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return process.env.TOKEN_SECRET?.trim() || null;
  return null;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(message: string): Promise<string | null> {
  const secret = getEmergencySecret();
  if (!secret) return null;
  const data = new TextEncoder().encode(secret);
  const payload = new TextEncoder().encode(message);

  if (!globalThis.crypto?.subtle) return null;
  const key = await globalThis.crypto.subtle.importKey('raw', data, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
  return base64urlEncode(new Uint8Array(signature));
}

function readCookie(request: Request): string | null {
  const cookies = request.headers.get('cookie') || '';
  const value = cookies.split(/; */).find((part) => part.startsWith(`${EMERGENCY_COOKIE_NAME}=`));
  return value ? value.substring(`${EMERGENCY_COOKIE_NAME}=`.length) : null;
}

export async function isEmergencyAccessCookieValid(request: Request): Promise<boolean> {
  const raw = readCookie(request);
  if (!raw) return false;
  const [expiresAtRaw, signature] = raw.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = await sign(`${EMERGENCY_TOKEN_PREFIX}.${expiresAtRaw}`);
  if (!expected || expected.length !== signature.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export async function issueEmergencyAccessCookie(): Promise<string | null> {
  const expiresAt = Math.floor(Date.now() / 1000) + EMERGENCY_COOKIE_TTL_SECONDS;
  const signature = await sign(`${EMERGENCY_TOKEN_PREFIX}.${expiresAt}`);
  if (!signature) return null;
  return `${expiresAt}.${signature}`;
}

export function emergencyCodeMatches(input: unknown): boolean {
  const configured = process.env.APP_ACCESS_EMERGENCY_SECRET?.trim();
  if (!configured || typeof input !== 'string' || input.length !== configured.length) return false;
  let difference = 0;
  for (let index = 0; index < configured.length; index += 1) {
    difference |= configured.charCodeAt(index) ^ input.charCodeAt(index);
  }
  return difference === 0;
}

export function buildEmergencyAccessCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${EMERGENCY_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict;${secure} Max-Age=${EMERGENCY_COOKIE_TTL_SECONDS}`;
}

export function buildClearEmergencyAccessCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${EMERGENCY_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict;${secure} Max-Age=0`;
}
