import { prisma } from "@/lib/prisma";

import {
  chooseReusablePrizeColor,
  generateReusablePrizeKey,
  PRIZE_IDENTITY_POLICY,
} from "./identity";

export async function createReusablePrize(input: { label: string; description: string | null }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const recent = await tx.reusablePrize.findMany({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: PRIZE_IDENTITY_POLICY.recentColors,
            select: { color: true },
          });
          return tx.reusablePrize.create({
            data: {
              ...input,
              key: generateReusablePrizeKey(),
              color: chooseReusablePrizeColor(recent.map((prize) => prize.color)),
            },
          });
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        attempt + 1 >= PRIZE_IDENTITY_POLICY.transactionAttempts ||
        !["P2034", "P2002"].includes(code || "")
      )
        throw error;
    }
  }
}
