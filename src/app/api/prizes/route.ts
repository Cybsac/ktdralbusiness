import { readStaticPrizeCatalog } from "@/lib/batch/static-catalog";
import { staticPrizeCreateFields } from "@/lib/batch/static-prizes";
import { nextStaticPrizeColor } from "@/lib/batch/static-prize-colors";
import { randomUUID } from "crypto";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { normalizeHexColor } from "@/lib/color";
import { prisma } from "@/lib/prisma";
import { nextGamePrizeColor } from "@/lib/prize-games/colors";
import { pendingGameStockWhere } from "@/lib/prize-games/catalog";
import { gameFailure } from "@/lib/prize-games/http";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";

const prizeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  gameEnabled: z.boolean().optional(),
  staticEnabled: z.boolean().optional(),
  stock: z.number().int().nonnegative().optional(),
});

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("scope") === "static") {
    const gate = await requirePrizeManagement(req);
    if (gate) return gate;
    return apiOk(await readStaticPrizeCatalog(), 200, { "Cache-Control": "private, no-store" });
  }

  if (new URL(req.url).searchParams.get("scope") === "game") {
    const gate = await requirePrizeManagement(req);
    if (gate) return gate;
    const items = await prisma.gamePrizeCatalogItem.findMany({
      where: pendingGameStockWhere,
      include: { prize: true },
      orderBy: { createdAt: "asc" },
    });
    return apiOk(
      items.map((item) => ({ ...item.prize, stock: item.stock })),
      200,
      { "Cache-Control": "no-store" }
    );
  }
  const prizes = await prisma.prize.findMany({
    where: {},
    orderBy: { createdAt: "asc" },
  });
  return apiOk(prizes, 200);
}

const gamePrizeSchema = z
  .object({ label: prizeSchema.shape.label, stock: z.number().int().nonnegative() })
  .strict();

export async function POST(req: Request) {
  const managementGate = await requirePrizeManagement(req);
  if (managementGate) return managementGate;
  const query = new URL(req.url).searchParams;
  const isGame = query.get("scope") === "game";
  const isStatic = query.get("scope") === "static";
  const json = await req.json().catch(() => null);
  if (
    isStatic &&
    !z
      .object({ label: prizeSchema.shape.label, stock: prizeSchema.shape.stock })
      .strict()
      .safeParse(json).success
  )
    return apiError("INVALID_BODY", "Nombre o stock inválido", undefined, 400);
  if (isGame) {
    const valid = gamePrizeSchema.safeParse(json);
    if (!valid.success)
      return apiError(
        "INVALID_BODY",
        "Indica el nombre y un stock numérico",
        valid.error.flatten(),
        400
      );
  }
  const parsed = prizeSchema.safeParse(json);
  if (!parsed.success)
    return apiError("INVALID_BODY", "Datos inválidos", parsed.error.flatten(), 400);
  // Compute a robust unique key: find the smallest available "premioN"
  async function computeNextKey() {
    const rows = await prisma.prize.findMany({
      select: { key: true },
      where: { key: { startsWith: "premio" } },
    });
    const used = new Set<number>();
    for (const r of rows) {
      const m = /^premio(\d+)$/.exec(String(r.key || ""));
      if (m) used.add(Number(m[1]));
    }
    let i = 1;
    while (used.has(i)) i++;
    return `premio${i}`;
  }
  const nextKey = () =>
    isGame || isStatic
      ? Promise.resolve(`${isGame ? "game" : "static"}_${randomUUID()}`)
      : computeNextKey();
  let key = await nextKey();
  let color = parsed.data.color;
  if (color != null) {
    if (color === "")
      color = undefined as any; // vacío => ignorar
    else {
      const norm = normalizeHexColor(color);
      if (!norm) return apiError("INVALID_COLOR", "Color inválido (usa #RRGGBB)", { color }, 400);
      color = norm;
    }
  }
  // Create with retry on unique constraint collisions
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const prize = isGame
        ? await prisma.$transaction(
            async (tx) => {
              return tx.prize.create({
                data: {
                  key,
                  label: parsed.data.label,
                  stock: 0,
                  active: true,
                  gameEnabled: true,
                  staticEnabled: false,
                  color: await nextGamePrizeColor(tx),
                  gameCatalogItems: {
                    create: { stock: parsed.data.stock! },
                  },
                },
              });
            },
            { isolationLevel: "Serializable" }
          )
        : isStatic
          ? await prisma.$transaction(
              async (tx) =>
                tx.prize.create({
                  data: {
                    key,
                    label: parsed.data.label,
                    stock: parsed.data.stock,
                    active: true,
                    ...staticPrizeCreateFields,
                    color: await nextStaticPrizeColor(tx),
                  },
                }),
              { isolationLevel: "Serializable" }
            )
          : await prisma.prize.create({ data: { key, ...parsed.data, color } });
      return apiOk(isGame ? { ...prize, stock: parsed.data.stock! } : prize, 201);
    } catch (e: any) {
      const code = e?.code || e?.errorCode || e?.meta?.code;
      if ((isGame || isStatic) && code === "P2034") continue;
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : e?.meta?.target;
      // Prisma P2002 = Unique constraint failed on the {constraint}
      if (
        (code === "P2002" || /unique/i.test(String(e?.message))) &&
        String(target || "").includes("key")
      ) {
        // Recompute next key and retry
        key = await nextKey();
        continue;
      }
      return apiError(
        "CREATE_FAILED",
        "No se pudo crear el premio",
        { message: String(e?.message || e) },
        500
      );
    }
  }
  return apiError("CREATE_CONFLICT", "No se pudo generar una clave única para el premio", {}, 409);
}
