import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin, BIRTHDAY_CARDS_BUCKET } from "@/lib/supabase-server";
import { BIRTHDAY_POLICY as P } from "./policy";
export async function enqueueBirthdayCleanup(
  tx: Pick<Prisma.TransactionClient, "birthdayStorageCleanup">,
  keys: string[],
  nextAttemptAt = new Date()
) {
  for (const storageKey of [...new Set(keys)])
    await tx.birthdayStorageCleanup.upsert({
      where: { storageKey },
      create: { storageKey, nextAttemptAt },
      update: { nextAttemptAt },
    });
}
/** Bounded work, invoked by explicit card operations or the protected maintenance endpoint. */
export async function processBirthdayStorageCleanup(keys?: string[]) {
  const jobs = await prisma.birthdayStorageCleanup.findMany({
    where: { nextAttemptAt: { lte: new Date() }, ...(keys ? { storageKey: { in: keys } } : {}) },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: P.cleanupBatchSize,
  });
  let removed = 0,
    failed = 0;
  for (const job of jobs) {
    const nextAttemptAt = new Date(Date.now() + P.cleanupLeaseMs);
    const claim = await prisma.birthdayStorageCleanup.updateMany({
      where: { id: job.id, nextAttemptAt: { lte: new Date() } },
      data: { nextAttemptAt, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    try {
      const active = await prisma.inviteTokenCard.findFirst({
        where: { storageKey: job.storageKey },
        select: { id: true },
      });
      if (!active) {
        const response = await supabaseAdmin.storage
          .from(BIRTHDAY_CARDS_BUCKET)
          .remove([job.storageKey]);
        if (response.error) throw new Error(response.error.message || "STORAGE_DELETE_FAILED");
        removed++;
      }
      await prisma.birthdayStorageCleanup.deleteMany({ where: { id: job.id, nextAttemptAt } });
    } catch (error) {
      failed++;
      await prisma.birthdayStorageCleanup.updateMany({
        where: { id: job.id, nextAttemptAt },
        data: {
          nextAttemptAt: new Date(Date.now() + P.cleanupRetryMs),
          lastError: (error instanceof Error ? error.message : "STORAGE_DELETE_FAILED").slice(
            0,
            1000
          ),
        },
      });
    }
  }
  return { removed, failed };
}
export async function tryBirthdayStorageCleanup(keys?: string[]) {
  try {
    return await processBirthdayStorageCleanup(keys);
  } catch (error) {
    console.warn("Birthday storage cleanup remains queued", error);
    return { removed: 0, failed: 1 };
  }
}
