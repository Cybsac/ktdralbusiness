import { createHmac } from "crypto";

import { prisma } from "@/lib/prisma";

import { getCluzterConfig } from "./config";

function positive(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
/** Atomic shared limit: rows contain no DNI, phone number or raw IP. */
export async function allowEmployeeLookup(subject: string, scope: "global" | "public" | "staff") {
  const now = new Date();
  const windowMs = positive(process.env.CLUZTER_EMPLOYEE_WINDOW_MS, 60000);
  const limit =
    scope === "global"
      ? positive(process.env.CLUZTER_PUBLIC_GLOBAL_LIMIT, 120)
      : scope === "public"
        ? positive(process.env.CLUZTER_PUBLIC_WINDOW_LIMIT, 5)
        : positive(process.env.CLUZTER_EMPLOYEE_WINDOW_LIMIT, 20);
  const reset = new Date(now.getTime() + windowMs);
  const { token } = getCluzterConfig();
  const hash = createHmac("sha256", token).update(subject).digest("hex");
  // A fixed number of public buckets prevents unbounded rows from changing IP addresses.
  const buckets = Math.min(65536, positive(process.env.CLUZTER_PUBLIC_LIMIT_BUCKETS, 4096));
  const identifier =
    scope === "global"
      ? "global"
      : scope === "public"
        ? String(parseInt(hash.slice(0, 8), 16) % buckets)
        : hash;
  const key = `employee:${scope}:${identifier}`;
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "CluzterLookupLimit" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "CluzterLookupLimit"."resetAt" <= ${now} THEN 1 ELSE "CluzterLookupLimit"."attempts" + 1 END,
      "resetAt" = CASE WHEN "CluzterLookupLimit"."resetAt" <= ${now} THEN ${reset} ELSE "CluzterLookupLimit"."resetAt" END
    RETURNING "attempts"`;
  return rows[0].attempts <= limit;
}
