import { Readable } from "stream";

import { getPublicBaseUrl } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { generateQrPngDataUrl } from "@/lib/qr";
import { createZipStream } from "@/lib/zip";

import { PrizeGameError } from "./contracts";
import type { IssuanceSnapshot } from "./issuance";

export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export async function buildBatchExport(batchId: string, requestUrl: string, includeQr = true) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { issuance: true, tokens: { include: { prize: true }, orderBy: { id: "asc" } } },
  });
  if (!batch) throw new PrizeGameError("NOT_FOUND", "Lote no encontrado", 404);
  const snapshot = batch.issuance?.snapshot as unknown as IssuanceSnapshot | undefined;
  const isStatic = batch.actionType != null || batch.staticTargetUrl != null;
  const base = getPublicBaseUrl(requestUrl);
  const columns = [
    "token_id",
    "batch_id",
    "prize_id",
    "prize_key",
    "prize_label",
    "prize_color",
    "paired_next_token_id",
    "expires_at_iso",
    "expires_at_unix",
    "signature",
    "signature_version",
    "redeem_url",
    "redeemed_at",
    "disabled",
  ];
  const csv = [columns.join(",")];
  const prizes = new Map<
    string,
    { prizeId: string; prizeKey: string; prizeLabel: string; count: number }
  >();
  const files: Array<{ id: string; url: string }> = [];
  for (const token of batch.tokens) {
    const original = snapshot?.prizes.find((prize) => prize.id === token.prizeId);
    const prize = {
      key: original?.key || token.prize.key,
      label: original?.label || token.prize.label,
      color: original ? original.color : token.prize.color,
    };
    const group = prizes.get(token.prizeId) || {
      prizeId: token.prizeId,
      prizeKey: prize.key,
      prizeLabel: prize.label,
      count: 0,
    };
    group.count++;
    prizes.set(token.prizeId, group);
    const url = `${base}/${isStatic ? "static" : "r"}/${token.id}`;
    csv.push(
      [
        token.id,
        batch.id,
        token.prizeId,
        prize.key,
        prize.label,
        prize.color,
        token.pairedNextTokenId,
        token.expiresAt.toISOString(),
        Math.floor(token.expiresAt.getTime() / 1000),
        token.signature,
        token.signatureVersion,
        url,
        token.redeemedAt?.toISOString(),
        token.disabled,
      ]
        .map(csvCell)
        .join(",")
    );
    if (includeQr || isStatic) files.push({ id: token.id, url });
  }
  const manifest = {
    batchId: batch.id,
    name: snapshot?.request.name || batch.description,
    description: batch.description,
    createdAt: batch.createdAt.toISOString(),
    prizes: [...prizes.values()],
    totals: { tokens: batch.tokens.length, prizes: prizes.size },
    meta: {
      mode: isStatic ? "static" : "auto",
      experienceType: batch.experienceType,
      totalTokens: batch.tokens.length,
      expirationDays: snapshot?.expirationDays ?? null,
      aggregatedPrizeCount: prizes.size,
      qrMode: includeQr || isStatic ? "eager" : "none",
      ...(snapshot
        ? {
            validFrom: snapshot.validFrom,
            expiresAt: snapshot.expiresAt,
            functionalDate: snapshot.functionalDate,
            prizeEmittedTotals: Object.fromEntries(
              snapshot.prizes.map((prize) => [prize.id, prize.count])
            ),
          }
        : {}),
    },
  };
  return { batch, manifest, csv: csv.join("\n"), files };
}
/** Render outside the issuance transaction. A failed render never causes another emission. */
export async function downloadBatch(
  batchId: string,
  requestUrl: string,
  includeQr = true,
  operationKey?: string
) {
  const data = await buildBatchExport(batchId, requestUrl, includeQr);
  const { archive, stream } = createZipStream();
  stream.on("close", () => archive.abort());
  const response = new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=lote_${data.batch.id}.zip`,
      "Cache-Control": "no-store",
      "X-Batch-Id": data.batch.id,
      ...(operationKey ? { "X-Emission-Key": operationKey } : {}),
    },
  });
  void (async () => {
    try {
      for (const file of data.files) {
        if (stream.destroyed) return;
        const image = await generateQrPngDataUrl(file.url);
        if (stream.destroyed) return;
        archive.append(Buffer.from(image.split(",")[1], "base64"), {
          name: `png/${file.id}.png`,
          date: data.batch.createdAt,
        });
      }
      archive.append(JSON.stringify(data.manifest, null, 2), {
        name: "manifest.json",
        date: data.batch.createdAt,
      });
      archive.append(data.csv, { name: "tokens.csv", date: data.batch.createdAt });
      await archive.finalize();
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error("Export failed"));
      archive.abort();
    }
  })();
  return response;
}
