import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { GAME_RESULT_KEYS, PrizeGameError } from "@/lib/prize-games/contracts";
import { gameFailure } from "@/lib/prize-games/http";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
import { nextGamePrizeColor } from "@/lib/prize-games/colors";

/** Repeating preparation never resets pending stock. */
export async function POST(request: Request) {
  const gate = await requirePrizeManagement(request);
  if (gate) return gate;
  const definitions = [
    { key: GAME_RESULT_KEYS.retry, label: "Nuevo intento" },
    { key: GAME_RESULT_KEYS.lose, label: "Sin premio" },
  ];
  try {
    await prisma.$transaction(async (tx) => {
      for (const definition of definitions) {
        const prize = await tx.prize.upsert({
          where: { key: definition.key },
          update: { active: true },
          create: {
            ...definition,
            color: await nextGamePrizeColor(tx),
            stock: 0,
            active: true,
            gameEnabled: true,
            staticEnabled: false,
          },
        });
        await tx.gamePrizeCatalogItem.upsert({
          where: { prizeId: prize.id },
          create: { prizeId: prize.id, stock: 0 },
          update: {},
        });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PrizeGameError) return gameFailure(error);
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "No se pudieron preparar los resultados" },
      { status: 500 }
    );
  }
}
