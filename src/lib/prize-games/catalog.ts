import type { Prisma } from "@prisma/client";
import { GAME_RESULT_KEYS, PrizeGameError } from "./contracts";

export const pendingGameStockWhere = {
  OR: [{ stock: { gt: 0 } }, { stock: null }],
} satisfies Prisma.GamePrizeCatalogItemWhereInput;

export function isSystemGamePrize(key: string) {
  return Object.values(GAME_RESULT_KEYS).some((value) => value === key);
}

// A prepared prize is intentional inventory, even before its first token is emitted.
export const orphanPrizeWhere = {
  tokens: { none: {} },
  assignedTokens: { none: {} },
  gameCatalogItems: { none: {} },
  key: { notIn: Object.values(GAME_RESULT_KEYS) },
} satisfies Prisma.PrizeWhereInput;

/** Only inventory explicitly registered in Tokenshow may be managed here. */
export async function updateGameCatalogPrize(
  tx: Prisma.TransactionClient,
  id: string,
  input: Pick<Prisma.PrizeUpdateInput, "label"> & {
    stock?: number;
  }
) {
  const prize = await tx.prize.findUnique({ where: { id } });
  if (!prize) throw new PrizeGameError("NOT_FOUND", "Premio no encontrado", 404);
  const item = await tx.gamePrizeCatalogItem.findUnique({
    where: { prizeId: id },
  });
  if (!item && !isSystemGamePrize(prize.key))
    throw new PrizeGameError(
      "PRIZE_NOT_IN_CATALOG",
      "Este premio no pertenece al catálogo de Tokenshow",
      409
    );
  const { stock, ...details } = input;
  if (stock !== undefined) {
    await tx.gamePrizeCatalogItem.upsert({
      where: { prizeId: id },
      create: { prizeId: id, stock },
      update: { stock },
    });
  }
  const updated = await tx.prize.update({ where: { id }, data: { ...details, active: true } });
  return { ...updated, stock: stock !== undefined ? stock : item ? item.stock : 0 };
}
