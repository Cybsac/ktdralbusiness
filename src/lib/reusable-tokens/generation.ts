import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } from "@/lib/signing";
import { REUSABLE_POLICY } from "./policy";
import { resolveReusableValidity, type ReusableGeneration } from "./request";
import { ReusableTokenError } from "./http";
export async function generateReusableToken(input: ReusableGeneration, userId: string) {
  const { requestKey, ...specification } = input;
  const generationKey = `${userId}:${requestKey}`;
  const generationHash = createHash("sha256").update(JSON.stringify(specification)).digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.reusableToken.findUnique({
            where: { generationKey },
            include: { prize: true, group: true },
          });
          if (existing) {
            if (existing.generationHash !== generationHash)
              throw new ReusableTokenError(
                "REQUEST_CONFLICT",
                "El identificador corresponde a otra configuración"
              );
            return existing;
          }
          const prize = await tx.reusablePrize.findFirst({
            where: { id: input.prizeId, active: true },
          });
          if (!prize)
            throw new ReusableTokenError("PRIZE_UNAVAILABLE", "Premio no disponible", 404);
          if (
            input.groupId &&
            !(await tx.tokenGroup.findUnique({
              where: { id: input.groupId },
              select: { id: true },
            }))
          )
            throw new ReusableTokenError("GROUP_NOT_FOUND", "Grupo no encontrado", 404);
          const validity = resolveReusableValidity(input.validity);
          const id = `rt_${randomBytes(16).toString("hex").toUpperCase()}`;
          const secret = SECRET_MAP[CURRENT_SIGNATURE_VERSION];
          if (!secret) throw new Error("MISSING_SIGNING_SECRET");
          return tx.reusableToken.create({
            data: {
              id,
              generationKey,
              generationHash,
              prizeId: prize.id,
              groupId: input.groupId || null,
              maxUses: input.maxUses,
              ...validity,
              deliveryNote: input.description || null,
              signature: signToken(
                secret,
                id,
                prize.id,
                validity.expiresAt,
                CURRENT_SIGNATURE_VERSION
              ),
              signatureVersion: CURRENT_SIGNATURE_VERSION,
            },
            include: { prize: true, group: true },
          });
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      if (
        attempt + 1 >= REUSABLE_POLICY.transactionAttempts ||
        !["P2034", "P2002"].includes((error as { code?: string }).code || "")
      )
        throw error;
    }
  }
}
