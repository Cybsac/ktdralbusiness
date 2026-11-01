import { prisma } from "@/lib/prisma";
import type { PrizeActor } from "@/lib/prize-authorization/service";
import { reusableAvailability } from "./validity";
import { ReusableTokenError } from "./http";
export async function consumeReusableToken(
  tokenId: string,
  actor: PrizeActor,
  operationKey?: string,
  type: "deliver" | "redeem" = "deliver"
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReusableToken" WHERE id=${tokenId} FOR UPDATE`;
    const token = await tx.reusableToken.findUnique({
      where: { id: tokenId },
      include: { prize: { select: { active: true, key: true, label: true, color: true } } },
    });
    if (!token) throw new ReusableTokenError("TOKEN_NOT_FOUND", "Token no encontrado", 404);
    if (operationKey) {
      const previous = await tx.reusableTokenRedemption.findUnique({
        where: { tokenId_operationKey: { tokenId, operationKey } },
      });
      if (previous) {
        if (previous.userId !== actor.userId)
          throw new ReusableTokenError(
            "OPERATION_CONFLICT",
            "La operación pertenece a otro responsable"
          );
        return token;
      }
    }
    await tx.$queryRaw`SELECT id FROM "ReusablePrize" WHERE id=${token.prizeId} FOR SHARE`;
    const prize = await tx.reusablePrize.findUniqueOrThrow({
      where: { id: token.prizeId },
      select: { active: true },
    });
    const now = new Date(),
      available = reusableAvailability({ ...token, prize }, now);
    if (available !== "AVAILABLE")
      throw new ReusableTokenError(
        available,
        "El QR está agotado, vencido, fuera de horario o deshabilitado"
      );
    const updated = await tx.reusableToken.update({
      where: { id: tokenId },
      data: {
        usedCount: { increment: 1 },
        redeemedAt: now,
        deliveredAt: now,
        deliveredByUserId: actor.userId,
      },
      include: { prize: { select: { active: true, key: true, label: true, color: true } } },
    });
    await tx.reusableTokenRedemption.create({
      data: {
        tokenId,
        type,
        userId: actor.userId,
        operationKey,
        note: JSON.stringify({
          authorizationMethod: actor.method,
          responsibleName: actor.name,
          credentialId: actor.credentialId,
          credentialRevision: actor.revision,
        }),
      },
    });
    return updated;
  });
}
