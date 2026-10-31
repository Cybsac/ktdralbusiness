import { Prisma } from "@prisma/client";
import { createHash, randomInt, randomUUID } from "crypto";

import { logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { activeTokenSigningKey, signToken } from "@/lib/signing";

import { pendingGameStockWhere } from "./catalog";
import { GAME_RESULT_KEYS, PrizeGameError } from "./contracts";
import { ISSUANCE_POLICY, issuanceSettings } from "./issuance-policy";
import {
  type IssuanceRequest,
  parseIssuanceRequest,
  resolveIssuanceValidity,
} from "./issuance-request";

export interface IssuancePrizeSnapshot {
  id: string;
  key: string;
  label: string;
  color: string | null;
  count: number;
}
export interface IssuanceSnapshot {
  version: 1;
  request: IssuanceRequest;
  prizes: IssuancePrizeSnapshot[];
  totalTokens: number;
  expirationDays: number | null;
  functionalDate: string;
  validFrom: string | null;
  expiresAt: string;
  signatureVersion: number;
}
export function issuanceHash(request: IssuanceRequest) {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}
function shuffle<T>(rows: T[]): T[] {
  for (let i = rows.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}
export function pairIssuedTokens(
  rows: Array<{ id: string; prizeId: string; pairedNextTokenId?: string | null }>,
  prizes: IssuancePrizeSnapshot[]
) {
  const keyById = new Map(prizes.map((prize) => [prize.id, prize.key]));
  const retries = rows.filter((row) => keyById.get(row.prizeId) === GAME_RESULT_KEYS.retry);
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = keyById.get(row.prizeId)!;
    if (key !== GAME_RESULT_KEYS.retry && key !== GAME_RESULT_KEYS.lose) {
      const bucket = buckets.get(key) || [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
  }
  const available = [...buckets.values()].reduce((sum, bucket) => sum + bucket.length, 0);
  if (retries.length > available)
    throw new PrizeGameError(
      "PAIRING_INSUFFICIENT",
      "No hay premios funcionales suficientes para los reintentos",
      400
    );
  const active = shuffle([...buckets.values()]).map((bucket) => shuffle(bucket));
  let cursor = 0;
  for (const retry of retries) {
    while (!active[cursor % active.length].length) cursor++;
    retry.pairedNextTokenId = active[cursor % active.length].pop()!.id;
    cursor++;
  }
}

/** A committed batch is the completed operation. Nothing persists for a failed issuance. */
export async function issueGameBatch(input: unknown, key: string, actorId?: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new PrizeGameError("INVALID_OPERATION_KEY", "Identificador de emisión inválido", 400);
  const request = parseIssuanceRequest(input);
  const hash = issuanceHash(request);
  const settings = issuanceSettings();
  for (let attempt = 0; ; attempt++)
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.gameIssuance.findUnique({
            where: { key },
            include: { batch: true },
          });
          if (existing) {
            if (existing.requestHash !== hash)
              throw new PrizeGameError(
                "OPERATION_CONFLICT",
                "Esta emisión ya corresponde a otra configuración"
              );
            if (!existing.batch)
              throw new PrizeGameError(
                "OPERATION_ARCHIVED",
                "Este lote fue retirado; la operación no se volverá a emitir",
                410
              );
            return {
              batch: existing.batch,
              snapshot: existing.snapshot as unknown as IssuanceSnapshot,
              reused: true,
            };
          }
          const now = new Date();
          const validity = resolveIssuanceValidity(request, now);
          const signing = activeTokenSigningKey();
          const catalog = await tx.gamePrizeCatalogItem.findMany({
            where: {
              ...pendingGameStockWhere,
              prize: { active: true, isReusable: false, gameEnabled: true },
            },
            include: { prize: true },
            orderBy: { prizeId: "asc" },
          });
          const prizes = catalog.map((item) => ({ ...item.prize, stock: item.stock }));
          if (prizes.some((prize) => prize.stock === null))
            throw new PrizeGameError(
              "STOCK_REQUIRED",
              "Define un stock numérico para todos los premios del catálogo",
              400
            );
          const plan = prizes
            .map((prize) => ({ prize, count: prize.stock! }))
            .filter((item) => item.count > 0);
          const total = plan.reduce((sum, item) => sum + item.count, 0);
          if (!total)
            throw new PrizeGameError(
              "NO_PRIZES",
              "Prepara premios con stock disponible para generar el lote",
              400
            );
          if (total > settings.maxTokens)
            throw new PrizeGameError(
              "LIMIT_EXCEEDED",
              `La emisión supera el límite de ${settings.maxTokens} tokens`,
              400
            );
          const snapshot: IssuanceSnapshot = {
            version: 1,
            request,
            prizes: plan.map(({ prize, count }) => ({
              id: prize.id,
              key: prize.key,
              label: prize.label,
              color: prize.color,
              count,
            })),
            totalTokens: total,
            expirationDays: validity.expirationDays,
            functionalDate: validity.functionalDate.toISOString(),
            validFrom: validity.validFrom?.toISOString() || null,
            expiresAt: validity.expiresAt.toISOString(),
            signatureVersion: signing.version,
          };
          const batchId = randomUUID();
          const rows = plan.flatMap(({ prize, count }) =>
            Array.from({ length: count }, () => {
              const id = randomUUID();
              return {
                id,
                batchId,
                prizeId: prize.id,
                expiresAt: validity.expiresAt,
                validFrom: validity.validFrom,
                startTime: validity.validFrom,
                endTime: validity.expiresAt,
                disabled: false,
                signatureVersion: signing.version,
                signature: signToken(
                  signing.secret,
                  id,
                  prize.id,
                  validity.expiresAt,
                  signing.version
                ),
                pairedNextTokenId: null as string | null,
              };
            })
          );
          pairIssuedTokens(rows, snapshot.prizes);
          const batch = await tx.batch.create({
            data: {
              id: batchId,
              description: request.name,
              experienceType: request.experienceType,
              createdBy: actorId,
              functionalDate: validity.functionalDate,
            },
          });
          for (const { prize, count } of plan) {
            const allocated = await tx.gamePrizeCatalogItem.updateMany({
              where: {
                prizeId: prize.id,
                stock: { gte: count },
              },
              data: { stock: { decrement: count } },
            });
            if (allocated.count !== 1)
              throw new PrizeGameError(
                "STOCK_CHANGED",
                "El stock del catálogo cambió. Actualiza el catálogo."
              );
            const updated = await tx.prize.updateMany({
              where: {
                id: prize.id,
                active: true,
                gameEnabled: true,
                isReusable: false,
              },
              data: {
                emittedTotal: { increment: count },
                lastEmittedAt: now,
              },
            });
            if (updated.count !== 1)
              throw new PrizeGameError(
                "STOCK_CHANGED",
                "El stock cambió durante la emisión. Reintenta con la misma operación."
              );
          }
          for (let offset = 0; offset < rows.length; offset += settings.chunk)
            await tx.token.createMany({ data: rows.slice(offset, offset + settings.chunk) });
          await tx.gameIssuance.create({
            data: {
              key,
              requestHash: hash,
              batchId: batch.id,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
          return { batch, snapshot, reused: false };
        },
        { isolationLevel: "Serializable", timeout: settings.timeout, maxWait: 10000 }
      );
      if (!result.reused)
        await logEvent("BATCH_AUTO_CREATE", "Emisión completada", {
          batchId: result.batch.id,
          operationKey: key,
          actorId,
        });
      return result;
    } catch (error) {
      const conflict = error as { code?: string; meta?: { target?: string | string[] } };
      const unique =
        conflict.code === "P2002" &&
        /(^|,)key(,|$)|GameIssuance_pkey/.test(String(conflict.meta?.target));
      if (
        (conflict.code !== "P2034" && !unique) ||
        attempt + 1 >= ISSUANCE_POLICY.transactionAttempts
      )
        throw error;
    }
}
