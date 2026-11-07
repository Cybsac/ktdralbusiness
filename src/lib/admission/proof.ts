import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const proofSchema = z
  .object({
    actor: z.string().min(1),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["DNI", "CE", "OTHER"]),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.enum(["CLUZTER", "MANUAL"]),
    exp: z.number().int(),
  })
  .strict();
export type AdmissionProof = z.infer<typeof proofSchema>;
function secret() {
  const value = process.env.ADMISSION_SECRET || process.env.TOKEN_SECRET;
  if (!value || value === "dev_secret") throw new Error("ADMISSION_NOT_CONFIGURED");
  return value;
}
function sign(data: string) {
  return createHmac("sha256", secret()).update(`admission-proof:${data}`).digest("base64url");
}
export function documentHash(type: string, number: string) {
  return createHmac("sha256", secret())
    .update(`admission-document:${type}:${number}`)
    .digest("hex");
}
export function createAdmissionProof(data: Omit<AdmissionProof, "exp">) {
  const seconds = Number(process.env.ADMISSION_PROOF_TTL_SECONDS || 300);
  const ttl = Number.isSafeInteger(seconds) && seconds >= 30 && seconds <= 1800 ? seconds : 300;
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttl })
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function readAdmissionProof(
  token: string,
  actor: string,
  day: string
): AdmissionProof | null {
  if (token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const actual = Buffer.from(parts[1]),
    expected = Buffer.from(sign(parts[0]));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = proofSchema.safeParse(
      JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
    );
    if (
      !parsed.success ||
      parsed.data.actor !== actor ||
      parsed.data.day !== day ||
      parsed.data.exp <= Date.now() / 1000
    )
      return null;
    return parsed.data;
  } catch {
    return null;
  }
}
