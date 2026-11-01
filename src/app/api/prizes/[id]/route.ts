import { staticPrizeWhere } from "@/lib/batch/static-prizes";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { normalizeHexColor } from "@/lib/color";
import { prisma } from "@/lib/prisma";
import { updateGameCatalogPrize } from "@/lib/prize-games/catalog";
import { PrizeGameError } from "@/lib/prize-games/contracts";
import { gameFailure } from "@/lib/prize-games/http";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  color: z.string().max(32).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  stock: z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional(),
  gameEnabled: z.boolean().optional(),
  staticEnabled: z.boolean().optional(),
});

const gameUpdateSchema = z
  .object({ label: updateSchema.shape.label, stock: z.number().int().nonnegative().optional() })
  .strict();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const managementGate = await requirePrizeManagement(req);
  if (managementGate) return managementGate;
  const body = await req.json().catch(() => ({}));
  const query = new URL(req.url).searchParams;
  if (query.get("scope") === "game") {
    const valid = gameUpdateSchema.safeParse(body);
    if (!valid.success)
      return apiError("INVALID_BODY", "Stock o nombre inválido", valid.error.flatten(), 400);
  }
  if (query.get("scope") === "static") {
    const valid = z
      .object({
        label: updateSchema.shape.label,
        stock: updateSchema.shape.stock,
        active: updateSchema.shape.active,
      })
      .strict()
      .safeParse(body);
    if (!valid.success)
      return apiError("INVALID_BODY", "Datos inválidos", valid.error.flatten(), 400);
    if (
      !(await prisma.prize.findFirst({
        where: { ...staticPrizeWhere, id: params.id },
        select: { id: true },
      }))
    )
      return apiError("NOT_FOUND", "Premio estático no encontrado", undefined, 404);
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_BODY", "Datos inválidos", parsed.error.flatten(), 400);
  }
  try {
    const data = { ...parsed.data };
    if ("color" in data) {
      if (data.color === null) {
        // explicit null => limpiar color
        data.color = null;
      } else if (typeof data.color === "string") {
        if (data.color === "")
          data.color = null; // vacío => null
        else {
          const norm = normalizeHexColor(data.color);
          if (!norm)
            return apiError(
              "INVALID_COLOR",
              "Color inválido (usa #RRGGBB)",
              { color: data.color },
              400
            );
          data.color = norm;
        }
      }
    }
    const catalogData = {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(typeof data.stock === "number" ? { stock: data.stock } : {}),
    };
    const updated =
      query.get("scope") === "game"
        ? await prisma.$transaction((tx) => updateGameCatalogPrize(tx, params.id, catalogData), {
            isolationLevel: "Serializable",
          })
        : await prisma.prize.update({ where: { id: params.id }, data });
    return apiOk(updated, 200);
  } catch (e) {
    if (e instanceof PrizeGameError) return gameFailure(e);
    if ((e as { code?: string }).code !== "P2025")
      return apiError("UPDATE_FAILED", "No se pudo guardar el premio", undefined, 500);
    return apiError("NOT_FOUND", "Premio no encontrado", { id: params.id }, 404);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const managementGate = await requirePrizeManagement(_req);
  if (managementGate) return managementGate;
  const id = params.id;
  if (
    new URL(_req.url).searchParams.get("scope") === "static" &&
    !(await prisma.prize.findFirst({ where: { ...staticPrizeWhere, id }, select: { id: true } }))
  )
    return apiError("NOT_FOUND", "Premio estático no encontrado", undefined, 404);

  if (new URL(_req.url).searchParams.get("scope") === "game") {
    try {
      if (
        !(await prisma.gamePrizeCatalogItem.findUnique({
          where: { prizeId: id },
        }))
      )
        return apiError(
          "PRIZE_NOT_IN_CATALOG",
          "Este premio no pertenece al catálogo de Tokenshow",
          undefined,
          409
        );
    } catch (error) {
      return gameFailure(error);
    }
  }
  const definition = await prisma.prize.findUnique({ where: { id }, select: { key: true } });
  if (definition && ["retry", "lose"].includes(definition.key))
    return apiError("SYSTEM_PRIZE", "Los resultados del sistema no se eliminan", undefined, 409);
  // Antes de eliminar, asegurarnos que no hay tokens que referencien este premio
  // Tanto por prizeId (asignado al crear) como por assignedPrizeId (asignación posterior)
  const [byPrizeCount, byAssignedCount] = await Promise.all([
    prisma.token.count({ where: { prizeId: id } }),
    prisma.token.count({ where: { assignedPrizeId: id } }),
  ]);

  if (byPrizeCount > 0 || byAssignedCount > 0) {
    return apiError(
      "PRIZE_IN_USE",
      "No se puede eliminar: existen tokens asociados a este premio",
      { prizeId: id, tokensByPrize: byPrizeCount, tokensByAssigned: byAssignedCount },
      409
    );
  }

  try {
    const deleted = await prisma.prize.delete({ where: { id } });
    return apiOk(deleted, 200);
  } catch (e) {
    if ((e as { code?: string }).code === "P2003")
      return apiError(
        "PRIZE_IN_USE",
        "El premio acaba de ser utilizado y no se puede eliminar",
        undefined,
        409
      );
    if ((e as { code?: string }).code !== "P2025")
      return apiError("DELETE_FAILED", "No se pudo eliminar el premio", undefined, 500);
    return apiError("NOT_FOUND", "Premio no encontrado", { id }, 404);
  }
}
