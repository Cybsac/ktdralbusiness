import type { ActionType } from "@/components/token-actions/types";
import {
  businessDayWindowUtc,
  computeBusinessDayFromUtc,
  getConfiguredCutoffHour,
  limaCalendarDayWindowUtc,
} from "@/lib/attendanceDay";
import { PrizeRequest } from "@/lib/batch/types";
import { prisma } from "@/lib/prisma";
import { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } from "@/lib/signing";

import { STATIC_BATCH_LIMITS } from "./static-policy";

export interface GenerateBatchOptions {
  description?: string;
  expirationDays?: number;
  overrideExpiresAt?: Date;
  overrideDisabled?: boolean;
  overrideValidFrom?: Date;
  /** When true, tokens are created without decrementing prize stock (e.g. phrase/message). */
  skipStock?: boolean;
  experienceType?: string;
  actionType?: ActionType;
  actionPayload?: string;
  staticTargetUrl?: string;
}

export interface GeneratedToken {
  id: string;
  prizeId: string;
  prizeKey: string;
  prizeLabel: string;
  prizeColor: string | null;
  expiresAt: Date;
  signature: string;
  signatureVersion: number;
}

export interface GenerateBatchResult {
  batch: { id: string; createdAt: Date; description: string | null };
  tokens: GeneratedToken[];
  meta: {
    mode: "static";
    expirationDays: number | null;
    aggregatedPrizeCount: number;
    totalTokens: number;
    qrMode: "eager";
  };
  prizeEmittedTotals: Record<string, number>;
}

export class PrizeNotFoundError extends Error {
  prizeId: string;
  constructor(prizeId: string) {
    super("PRIZE_NOT_FOUND");
    this.prizeId = prizeId;
  }
}

export class InsufficientStockError extends Error {
  prizeId: string;
  constructor(prizeId: string) {
    super("INSUFFICIENT_STOCK");
    this.prizeId = prizeId;
  }
}

interface BuildPrizeTokensArgs {
  prize: any; // Prisma Prize type (kept as any to avoid pulling type)
  count: number;
  expirationDays: number;
  batchId: string;
  secret: string;
  overrideExpiresAt?: Date;
  overrideDisabled?: boolean;
  overrideValidFrom?: Date;
}

function buildPrizeTokens(args: BuildPrizeTokensArgs) {
  const {
    prize,
    count,
    expirationDays,
    batchId,
    secret,
    overrideExpiresAt,
    overrideDisabled,
    overrideValidFrom,
  } = args;

  const now = new Date();
  const currentBusinessDay = computeBusinessDayFromUtc(now, getConfiguredCutoffHour());
  const targetBusinessDayDate = new Date(`${currentBusinessDay}T12:00:00Z`);
  targetBusinessDayDate.setUTCDate(
    targetBusinessDayDate.getUTCDate() + Math.max((expirationDays || 1) - 1, 0)
  );
  const targetBusinessDay = targetBusinessDayDate.toISOString().slice(0, 10);
  const expiresAt = overrideExpiresAt || businessDayWindowUtc(targetBusinessDay).endUtc;

  const rows: any[] = [];
  const tokens: GeneratedToken[] = [];
  for (let i = 0; i < count; i++) {
    const tokenId = crypto.randomUUID();
    const signature = signToken(secret, tokenId, prize.id, expiresAt, CURRENT_SIGNATURE_VERSION);
    const baseRow: any = {
      id: tokenId,
      prizeId: prize.id,
      batchId,
      expiresAt,
      signature,
      disabled: overrideDisabled ?? false,
      ...(overrideValidFrom ? { validFrom: overrideValidFrom } : {}),
    };
    baseRow.signatureVersion = CURRENT_SIGNATURE_VERSION;
    rows.push(baseRow);
    tokens.push({
      id: tokenId,
      prizeId: prize.id,
      prizeKey: prize.key,
      prizeLabel: prize.label,
      prizeColor: prize.color || null,
      expiresAt,
      signature,
      signatureVersion: CURRENT_SIGNATURE_VERSION,
    });
  }
  return { rows, tokens };
}

// --- functionalDate derivation (duplicated logic similar to restore & backfill) ---
function limaMidnightUtc(y: number, m: number, d: number) {
  const normalizedDate = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  return limaCalendarDayWindowUtc(normalizedDate).startUtc;
}

const datePatterns: RegExp[] = [
  /(\d{2})[./-](\d{2})[./-](\d{4})/,
  /(\d{2})(\d{2})(\d{4})/,
  /(\d{2})[./-](\d{2})[./-](\d{2})/,
];
function deriveFunctionalDate(description: string | null | undefined, createdAt: Date) {
  let y: number | undefined, m: number | undefined, d: number | undefined;
  if (description) {
    // Collect ALL date matches and pick the latest one (handles descriptions with multiple dates)
    let bestDate: Date | null = null;
    for (const rg of datePatterns) {
      const globalRg = new RegExp(rg.source, "g");
      let mt: RegExpExecArray | null;
      while ((mt = globalRg.exec(description)) !== null) {
        let td: number, tm: number, ty: number;
        if (mt[0].length === 8 && /\d{8}/.test(mt[0])) {
          td = parseInt(mt[1], 10);
          tm = parseInt(mt[2], 10);
          ty = parseInt(mt[3], 10);
        } else if (mt[3] && mt[3].length === 2) {
          td = parseInt(mt[1], 10);
          tm = parseInt(mt[2], 10);
          ty = 2000 + parseInt(mt[3], 10);
        } else {
          td = parseInt(mt[1], 10);
          tm = parseInt(mt[2], 10);
          ty = parseInt(mt[3], 10);
        }
        const candidate = limaMidnightUtc(ty, tm, td);
        if (!bestDate || candidate.getTime() > bestDate.getTime()) {
          bestDate = candidate;
          y = ty;
          m = tm;
          d = td;
        }
      }
    }
  }
  if (y && m && d) return limaMidnightUtc(y, m, d);

  const fallbackBusinessDay = computeBusinessDayFromUtc(createdAt, getConfiguredCutoffHour());
  return limaCalendarDayWindowUtc(fallbackBusinessDay).startUtc;
}

/**
 * Static batch generation: create exactly the requested number of tokens per prize,
 * Atomically consumes the requested stock, unless skipStock is enabled.
 * No pairing logic (not applicable to static batches).
 */
export async function generateBatchStatic(
  prizeRequests: PrizeRequest[],
  options: GenerateBatchOptions = {}
): Promise<GenerateBatchResult> {
  if (!prizeRequests.length) throw new Error("NO_PRIZES");

  // Validate prizes exist
  const prizeIds = [...new Set(prizeRequests.map((p) => p.prizeId))];

  const secret = SECRET_MAP[CURRENT_SIGNATURE_VERSION];
  if (!secret) throw new Error("MISSING_SIGNING_SECRET");
  return prisma.$transaction(
    async (tx) => {
      const prizes = await tx.prize.findMany({
        where: { id: { in: prizeIds }, active: true, staticEnabled: true },
      });
      const prizeMap = new Map(prizes.map((prize) => [prize.id, prize]));
      for (const id of prizeIds) if (!prizeMap.has(id)) throw new PrizeNotFoundError(id);
      const createdTokens: GeneratedToken[] = [];
      let batchRecord: { id: string; createdAt: Date; description: string | null } | null = null;
      const emittedTotals: Record<string, number> = {};
      const allRows: any[] = [];

      // Create batch and set functionalDate
      const b = await tx.batch.create({
        data: {
          description: options.description,
          experienceType: options.experienceType || "roulette",
          ...(options.actionType
            ? {
                actionType: options.actionType,
                actionPayload: options.actionPayload || null,
                staticTargetUrl: options.staticTargetUrl ?? "",
              }
            : {}),
        },
      });
      try {
        const fDate = deriveFunctionalDate(options.description, b.createdAt);
        await tx.batch.update({ where: { id: b.id }, data: { functionalDate: fDate } });
      } catch {
        throw new Error("FUNCTIONAL_DATE_UPDATE_FAILED");
      }
      batchRecord = { id: b.id, createdAt: b.createdAt, description: b.description };

      const configuredChunk = Number(
        process.env.BATCH_CREATE_CHUNK || STATIC_BATCH_LIMITS.insertChunk
      );
      const CREATE_CHUNK =
        Number.isInteger(configuredChunk) && configuredChunk > 0
          ? configuredChunk
          : STATIC_BATCH_LIMITS.insertChunk;

      // Build rows exactly as requested and consume stock
      for (const req of prizeRequests) {
        const prize = prizeMap.get(req.prizeId)!;
        const effectiveExpirationDays = req.expirationDays ?? options.expirationDays;
        if (!effectiveExpirationDays || effectiveExpirationDays <= 0) {
          throw new Error(`INVALID_EXPIRATION_DAYS:${req.prizeId}`);
        }
        const count = (req as any).count ?? 0;
        if (!Number.isInteger(count) || count < 0) {
          throw new Error(`INVALID_PLANNED_COUNT:${req.prizeId}`);
        }
        if (count === 0) continue;

        // Consume stock unless explicitly skipped (e.g. phrase/message actions)
        if (!options.skipStock) {
          const upd = await tx.prize.updateMany({
            where: {
              id: prize.id,
              active: true,
              staticEnabled: true,
              OR: [{ stock: null }, { stock: { gte: count } }],
            },
            data: {
              stock: { decrement: count },
              emittedTotal: { increment: count },
              lastEmittedAt: new Date(),
            } as any,
          });
          if (upd.count === 0) throw new InsufficientStockError(prize.id);
        }

        const { rows, tokens } = buildPrizeTokens({
          prize,
          count,
          expirationDays: effectiveExpirationDays,
          batchId: b.id,
          secret,
          overrideExpiresAt: options.overrideExpiresAt,
          overrideDisabled: options.overrideDisabled,
          overrideValidFrom: options.overrideValidFrom,
        });
        allRows.push(...rows);
        createdTokens.push(...tokens);
        emittedTotals[prize.id] = (emittedTotals[prize.id] || 0) + count;
      }

      // Insert tokens in chunks (no pairing needed for static batches)
      if (allRows.length) {
        for (let i = 0; i < allRows.length; i += CREATE_CHUNK) {
          const slice = allRows.slice(i, i + CREATE_CHUNK);
          // eslint-disable-next-line no-await-in-loop
          await tx.token.createMany({ data: slice });
        }
      }

      if (!batchRecord) throw new Error("BATCH_NOT_CREATED");
      const meta = {
        mode: "static" as const,
        expirationDays: options.expirationDays ?? null,
        aggregatedPrizeCount: prizeIds.length,
        totalTokens: createdTokens.length,
        qrMode: "eager" as const,
      };
      return { batch: batchRecord, tokens: createdTokens, meta, prizeEmittedTotals: emittedTotals };
    },
    { timeout: STATIC_BATCH_LIMITS.transactionTimeoutMs }
  );
}
