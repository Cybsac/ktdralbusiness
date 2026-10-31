import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { GAME_POLICY, PrizeGameError } from "./contracts";

export async function gameTransaction<T>(
  fn: (_tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      const conflict = error as { code?: string; meta?: { target?: string[] } };
      const orderConflict =
        conflict.code === "P2002" &&
        conflict.meta?.target?.includes("sessionId") &&
        conflict.meta.target.includes("order");
      if (conflict.code !== "P2034" && !orderConflict) throw error;
      if (attempt + 1 >= GAME_POLICY.transactionAttempts)
        throw new PrizeGameError(
          "GAME_BUSY",
          "Hay otra operación en curso. Actualiza e intenta nuevamente."
        );
    }
}
