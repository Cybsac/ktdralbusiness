import { Readable } from "stream";

import { PRIZELESS_ACTIONS } from "@/components/token-actions/types";
import { apiError } from "@/lib/apiError";
import { generateBatchStatic, InsufficientStockError } from "@/lib/batch/generateBatchStatic";
import { resolveStaticValidity, staticBatchRequestSchema } from "@/lib/batch/static-request";
import { getPublicBaseUrl } from "@/lib/config";
import { logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
import { generateQrPngDataUrl } from "@/lib/qr";
import { createZipStream } from "@/lib/zip";

export async function POST(req: Request) {
  const managementGate = await requirePrizeManagement(req);
  if (managementGate) return managementGate;
  let parsed;
  try {
    const json = await req.json();
    parsed = staticBatchRequestSchema.safeParse(json);
  } catch {
    return apiError("BAD_REQUEST", "JSON inválido", undefined, 400);
  }
  if (!parsed.success) {
    return apiError("BAD_REQUEST", "Datos inválidos", { issues: parsed.error.issues }, 400);
  }
  const {
    name,
    targetUrl,
    prizes: rawPrizes,
    tokenCount,
    validity,
    actionType,
    actionPayload,
  } = parsed.data;

  const skipStock = PRIZELESS_ACTIONS.has(actionType);
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  try {
    ({ windowStart, windowEnd } = resolveStaticValidity(validity));
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_DATE";
    return apiError(
      code,
      code === "PAST_DATE"
        ? "No se pueden crear lotes para fechas/horas pasadas"
        : "Fecha inválida",
      undefined,
      400
    );
  }

  // For prizeless actions with no prizes specified, resolve a placeholder prize
  // Aggregate duplicate entries before stock validation and allocation.
  const counts = new Map<string, number>();
  for (const prize of rawPrizes)
    counts.set(prize.prizeId, (counts.get(prize.prizeId) || 0) + prize.count);
  let prizes = [...counts].map(([prizeId, count]) => ({ prizeId, count }));
  if (skipStock && prizes.length === 0) {
    if (!tokenCount || tokenCount <= 0) {
      return apiError(
        "BAD_REQUEST",
        "tokenCount requerido para acciones sin premio",
        undefined,
        400
      );
    }
    // Pick any active prize as a carrier (stock won't be consumed)
    const placeholder = await prisma.prize.findFirst({
      where: { active: true },
      select: { id: true },
    });
    if (!placeholder) {
      return apiError(
        "NO_ACTIVE_PRIZE",
        "Se requiere al menos un premio activo como referencia",
        undefined,
        400
      );
    }
    prizes = [{ prizeId: placeholder.id, count: tokenCount }];
  } else if (prizes.length === 0) {
    return apiError("BAD_REQUEST", "Se requiere al menos un premio", undefined, 400);
  }

  // Validate prizes existence & fetch minimal info
  const prizeIds = [...new Set(prizes.map((p) => p.prizeId))];
  const dbPrizes = await prisma.prize.findMany({
    where: { id: { in: prizeIds }, active: true },
    select: { id: true, key: true, label: true, color: true, stock: true },
  });
  if (dbPrizes.length !== prizeIds.length) {
    return apiError("PRIZE_NOT_FOUND", "Algún premio no existe o está inactivo", { prizeIds }, 400);
  }

  // Validate sufficient stock for each prize (skip for prizeless actions)
  if (!skipStock) {
    for (const reqP of prizes) {
      const dbp = dbPrizes.find((p) => p.id === reqP.prizeId)!;
      if (dbp.stock !== null && dbp.stock < reqP.count) {
        return apiError(
          "INSUFFICIENT_STOCK",
          "Stock insuficiente",
          { prizeId: dbp.id, have: dbp.stock, need: reqP.count },
          400
        );
      }
    }
  }

  // Determine base expirationDays for initial generation (will be patched for singleDay/hour)
  let baseExpirationDays: number = 1;
  if (validity.mode === "byDays") baseExpirationDays = validity.expirationDays;

  // Prepare prizeRequests with exact counts
  const prizeRequests = prizes.map((p) => ({
    prizeId: p.prizeId,
    count: p.count,
    expirationDays: baseExpirationDays,
  }));

  let result;
  try {
    result = await generateBatchStatic(prizeRequests, {
      description: name,
      expirationDays: baseExpirationDays,
      skipStock,
      actionType,
      actionPayload,
      staticTargetUrl: targetUrl || "",
      overrideExpiresAt: windowEnd || undefined,
      overrideValidFrom: windowStart || undefined,
      overrideDisabled: false,
    });
  } catch (e: any) {
    if (e instanceof InsufficientStockError)
      return apiError(
        "INSUFFICIENT_STOCK",
        "El stock cambió durante la generación. Actualiza las cantidades.",
        undefined,
        409
      );
    return apiError("STATIC_GEN_FAIL", "Fallo generación", { message: e?.message }, 500);
  }

  // Reload tokens for manifest/CSV (need updated expiresAt/disabled)
  const tokens = await prisma.token.findMany({
    where: { batchId: result.batch.id },
    include: { prize: { select: { key: true, label: true, color: true } } },
  });

  // Build ZIP
  const { archive, stream } = createZipStream();
  const csvColumns = [
    "token_id",
    "batch_id",
    "prize_id",
    "prize_key",
    "prize_label",
    "prize_color",
    "expires_at_iso",
    "expires_at_unix",
    "signature",
    "redirect_url",
    "redeemed_at",
    "disabled",
  ];
  const csvRows: string[] = [csvColumns.join(",")];
  const baseUrl = getPublicBaseUrl(req.url);

  const grouped = new Map<string, (typeof tokens)[number][]>();
  for (const t of tokens) {
    if (!grouped.has(t.prizeId)) grouped.set(t.prizeId, []);
    grouped.get(t.prizeId)!.push(t);
  }

  const manifest: any = {
    batchId: result.batch.id,
    name,
    createdAt: result.batch.createdAt.toISOString(),
    prizes: [] as any[],
    meta: {
      mode: "static",
      static: true,
      staticTargetUrl: targetUrl,
      actionType,
      validityMode: validity.mode,
      windowStartIso: windowStart?.toISOString() || null,
      windowEndIso: windowEnd?.toISOString() || null,
      totalTokens: tokens.length,
      qrMode: "eager",
    },
  };

  for (const [prizeId, list] of grouped.entries()) {
    const first = list[0];
    manifest.prizes.push({
      prizeId,
      prizeKey: first.prize.key,
      prizeLabel: first.prize.label,
      count: list.length,
    });
    for (const t of list) {
      const redirectUrl = `${baseUrl}/static/${t.id}`;
      csvRows.push(
        [
          t.id,
          result.batch.id,
          prizeId,
          first.prize.key,
          first.prize.label,
          first.prize.color || "",
          t.expiresAt.toISOString(),
          Math.floor(t.expiresAt.getTime() / 1000).toString(),
          t.signature,
          redirectUrl,
          "",
          t.disabled ? "true" : "false",
        ]
          .map(csvEscape)
          .join(",")
      );
      {
        const dataUrl = await generateQrPngDataUrl(redirectUrl);
        const base64 = dataUrl.split(",")[1];
        archive.append(Buffer.from(base64, "base64"), { name: `png/${t.id}.png` });
      }
    }
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.append(csvRows.join("\n"), { name: "tokens.csv" });
  archive.finalize();

  await logEvent("STATIC_BATCH_CREATE", "lote estático creado", {
    batchId: result.batch.id,
    targetUrl,
    tokens: tokens.length,
  });

  const slug = slugify(name);
  return new Response(Readable.toWeb(stream) as any, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=${slug}_${result.batch.id}.zip`,
      "Cache-Control": "no-store",
    },
  });
}

function slugify(str: string) {
  return (
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) || "lote"
  );
}

function csvEscape(val: string) {
  if (val == null) return "";
  const needs = /[",\n\r]/.test(val);
  if (!needs) return val;
  return '"' + val.replace(/"/g, '""') + '"';
}
