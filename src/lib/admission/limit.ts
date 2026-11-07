import { prisma } from "@/lib/prisma";

import { documentHash } from "./proof";

function positive(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
/** Shared atomic per-operator limit, including manual document checks. */
export async function allowAdmissionCheck(actor: string) {
  const now = new Date();
  const reset = new Date(now.getTime() + positive(process.env.ADMISSION_CHECK_WINDOW_MS, 60_000));
  const limit = positive(process.env.ADMISSION_CHECK_WINDOW_LIMIT, 60);
  const key = `admission:${documentHash("operator", actor)}`;
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "CluzterLookupLimit" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "CluzterLookupLimit"."resetAt" <= ${now} THEN 1 ELSE "CluzterLookupLimit"."attempts" + 1 END,
      "resetAt" = CASE WHEN "CluzterLookupLimit"."resetAt" <= ${now} THEN ${reset} ELSE "CluzterLookupLimit"."resetAt" END
    RETURNING "attempts"`;
  return rows[0].attempts <= limit;
}
