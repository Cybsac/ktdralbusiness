import { createHmac, timingSafeEqual } from "crypto";

type Identity = { documento: string; name: string; birthDate: string };
const validitySeconds = 60 * 60;

function signature(identity: Identity, expires: number): string | null {
  const secret = process.env.TOKEN_SECRET?.trim();
  if (!secret || secret === "dev_secret") return null;
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "birthday-identity",
        identity.documento,
        identity.name,
        identity.birthDate,
        expires,
      ])
    )
    .digest("base64url");
}

export function signBirthdayIdentity(identity: Identity, now = Date.now()): string | null {
  const expires = Math.floor(now / 1000) + validitySeconds;
  const mac = signature(identity, expires);
  return mac ? `${expires}.${mac}` : null;
}

export function verifyBirthdayIdentity(
  identity: Identity,
  proof: string,
  now = Date.now()
): boolean {
  const [rawExpires, mac, extra] = proof.split(".");
  if (extra || !/^\d+$/.test(rawExpires || "") || !mac || !/^[A-Za-z0-9_-]+$/.test(mac))
    return false;
  const expires = Number(rawExpires);
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expires) || expires < current || expires > current + validitySeconds)
    return false;
  const expected = signature(identity, expires);
  if (!expected) return false;
  const actualBytes = Buffer.from(mac);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
