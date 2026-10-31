import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";

// Existing credentials (including explicit revocations) are never changed here.
export async function enableMissingPrizeCredentials(tx: Prisma.TransactionClient, actorId: string) {
  const users = await tx.user.findMany({
    where: { person: { active: true }, prizeAuthorizationCredential: null },
    select: { id: true },
  });
  if (!users.length) return 0;
  const created = await tx.prizeAuthorizationCredential.createMany({
    data: users.map((user) => ({
      userId: user.id,
      secret: randomBytes(32).toString("hex"),
      enabled: true,
      updatedBy: actorId,
    })),
    skipDuplicates: true,
  });
  return created.count;
}
