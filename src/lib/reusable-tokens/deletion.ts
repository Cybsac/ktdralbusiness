import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export async function deleteUnusedReusableTokens(ids: string[]) {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return { deleted: 0, skipped: 0 };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "ReusableToken" WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`
    );
    const unused = await tx.reusableToken.findMany({
      where: { id: { in: unique }, usedCount: 0, redemptions: { none: {} } },
      select: { id: true },
    });
    const result = await tx.reusableToken.deleteMany({
      where: {
        id: { in: unused.map((token) => token.id) },
        usedCount: 0,
        redemptions: { none: {} },
      },
    });
    return { deleted: result.count, skipped: unique.length - result.count };
  });
}
