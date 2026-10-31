#!/usr/bin/env tsx
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Trusted operator CLI: same issuance and export services as the administration UI.
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      auto: { type: "boolean" },
      days: { type: "string" },
      expiration: { type: "string" },
      desc: { type: "string" },
      key: { type: "string" },
      out: { type: "string" },
      qr: { type: "boolean", default: true },
      "no-qr": { type: "boolean" },
      "lazy-qr": { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Uso: tsx scripts/generateBatch.ts --auto --days N --key IDENTIFICADOR [--desc TEXTO] [--out CARPETA] [--no-qr|--lazy-qr]\nRepite el mismo identificador y opciones para recuperar la emisión."
    );
    return;
  }
  if (!values.auto || !values.key)
    throw new Error("Se requieren --auto y --key. Conserva la misma clave al reintentar.");
  loadEnvConfig(process.cwd(), true);
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_QR_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) throw new Error("Configura una URL pública antes de emitir QR");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const { issueGameBatch } = await import("../src/lib/prize-games/issuance");
    const { buildBatchExport } = await import("../src/lib/prize-games/batch-export");
    const { generateQrPngDataUrl } = await import("../src/lib/qr");
    const result = await issueGameBatch(
      {
        mode: "byDays",
        expirationDays: Number(values.days || values.expiration),
        name: values.desc || "Lote",
        includeQr: !!values.qr && !values["no-qr"],
        lazyQr: !!values["lazy-qr"],
      },
      values.key
    );
    console.log({ batchId: result.batch.id, reused: result.reused, operationKey: values.key });
    const output = resolve(values.out || `out_auto_batch_${result.batch.id}`);
    const exported = await buildBatchExport(
      result.batch.id,
      base,
      result.snapshot.request.includeQr && !result.snapshot.request.lazyQr
    );
    await mkdir(output, { recursive: true });
    await writeFile(join(output, "manifest.json"), JSON.stringify(exported.manifest, null, 2));
    await writeFile(join(output, "tokens.csv"), exported.csv);
    if (exported.files.length) await mkdir(join(output, "png"), { recursive: true });
    for (const file of exported.files) {
      const image = await generateQrPngDataUrl(file.url);
      await writeFile(
        join(output, "png", `${file.id}.png`),
        Buffer.from(image.split(",")[1], "base64")
      );
    }
    console.log({ output, tokens: result.snapshot.totalTokens });
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "No se pudo completar la emisión");
  process.exitCode = 1;
});
