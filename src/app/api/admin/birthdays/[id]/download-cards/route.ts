import { birthdayCardAvailable } from "@/lib/birthdays/card-policy";
import { universalInvitation } from "@/lib/birthdays/universal";
import { randomUUID } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import { z } from "zod";

import { apiError } from "@/lib/apiError";
import { generateInviteCard } from "@/lib/birthdays/generateInviteCard";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { getBirthdayQrBaseUrl } from "@/lib/config";
import { composeTemplateWithQr } from "@/lib/print/compose";
import { prisma } from "@/lib/prisma";
import { generateQrPngDataUrl } from "@/lib/qr";
import { checkRateLimit } from "@/lib/rateLimit";
import { createZipStream } from "@/lib/zip";

const QuerySchema = z.object({
  templateId: z.string().optional(),
  // optional limits
  max: z.coerce.number().int().min(1).max(5000).optional(),
});

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:(.*?);base64,(.+)$/);
  if (!m) throw new Error("INVALID_DATA_URL");
  return Buffer.from(m[2], "base64");
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Authn/Authz
  if (!(await birthdayManager(req))) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

  // RL: protect heavy export
  const ip = req.headers.get("x-forwarded-for") || (req as any).ip || "unknown";
  const rl = checkRateLimit(`admin:birthdays:cards:${ip}`);
  if (!rl.ok)
    return apiError("RATE_LIMITED", "Too many requests", undefined, 429, {
      "Retry-After": String(rl.retryAfterSeconds),
    });

  // Parse query
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    templateId: searchParams.get("templateId") || undefined,
    max: searchParams.get("max") || undefined,
  });
  if (!parsed.success)
    return apiError("INVALID_QUERY", "Validation failed", parsed.error.flatten(), 400);
  const limit = parsed.data.max ?? 2000;

  // Fetch reservation and tokens
  const reservationId = params.id;
  const reservation = await prisma.birthdayReservation.findUnique({
    where: { id: reservationId },
    include: { pack: true },
  });
  if (!reservation) return apiError("NOT_FOUND", "Reservation not found", undefined, 404);

  if (!birthdayCardAvailable(reservation))
    return apiError(
      "RESERVATION_UNAVAILABLE",
      "La reserva no tiene una tarjeta vigente",
      undefined,
      409
    );

  const tokens = await prisma.inviteToken.findMany({
    where: { reservationId },
    orderBy: { code: "asc" },
  });
  if (!tokens.length)
    return apiError("NO_TOKENS", "No invite tokens for this reservation", undefined, 404);

  // One canonical invitation; historical codes remain valid for existing recipients.
  const universal = universalInvitation(tokens);
  if (!universal) return apiError("NO_TOKENS", "No hay invitación disponible", undefined, 404);

  // Try to get pre-generated birthday cards from storage

  // The universal invitation uses the birthday design with current reservation data.
  // Explicit print templates retain their existing export behavior below.
  if (!parsed.data.templateId) {
    const baseUrl = getBirthdayQrBaseUrl(req.url);
    const images = await Promise.all(
      [universal].map(async (t) => ({
        code: t.code,
        buffer: await generateInviteCard(
          t.kind === "host" ? "host" : "guest",
          t.code,
          `${baseUrl}/b/${encodeURIComponent(t.code)}`,
          "png",
          reservation.celebrantName,
          reservation.date.toISOString()
        ),
      }))
    );
    const { archive, stream } = createZipStream();
    for (const image of images) archive.append(image.buffer, { name: `invite-${image.code}.png` });
    void archive.finalize();
    const { Readable } = await import("stream");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="reservation-${reservationId}-invites.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Resolve print template
  let template = null as null | {
    id: string;
    filePath: string | null;
    storageUrl: string | null;
    storageKey: string | null;
    meta: string | null;
  };
  if (parsed.data.templateId) {
    template = await prisma.printTemplate.findUnique({
      where: { id: parsed.data.templateId },
      select: { id: true, filePath: true, storageUrl: true, storageKey: true, meta: true },
    });
  }
  if (!template) return apiError("NO_TEMPLATE", "No print template configured", undefined, 400);

  // Resolve template path - prefer Supabase URL, fallback to local file
  let templatePath: string;
  let tempTemplatePath: string | null = null;

  if (template.storageUrl) {
    // Download from Supabase
    console.log("Downloading template from Supabase:", template.storageUrl);
    const response = await fetch(template.storageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download template from Supabase: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    tempTemplatePath = path.join(os.tmpdir(), `template-${randomUUID()}.png`);
    await writeFile(tempTemplatePath, new Uint8Array(arrayBuffer));
    templatePath = tempTemplatePath;
  } else if (template.filePath) {
    // Use local file (compatibility)
    templatePath = path.resolve(
      process.cwd(),
      template.filePath.startsWith("public/")
        ? template.filePath
        : `public/templates/${template.filePath}`
    );
  } else {
    return apiError("TEMPLATE_FILE_NOT_FOUND", "No template file available", undefined, 400);
  }

  console.log("Using template path:", templatePath);
  let dpi = 300;
  let qrMeta = { xMm: 150, yMm: 230, widthMm: 30, rotationDeg: 0 } as {
    xMm: number;
    yMm: number;
    widthMm: number;
    rotationDeg?: number;
  };
  if (template.meta) {
    try {
      const meta = JSON.parse(template.meta);
      if (meta.dpi) dpi = meta.dpi;
      if (meta.qr) qrMeta = meta.qr;
    } catch {
      // ignore bad meta
    }
  }

  // Create ZIP streaming
  const { archive, stream } = createZipStream();

  // Start async composition and append to archive
  (async () => {
    try {
      const baseUrl = getBirthdayQrBaseUrl(req.url);

      const redeemUrl = `${baseUrl}/b/${encodeURIComponent(universal.code)}`;
      const composed = await composeTemplateWithQr({
        templatePath,
        qrBuffer: dataUrlToBuffer(await generateQrPngDataUrl(redeemUrl)),
        qrMetadata: qrMeta,
        dpi,
      });
      archive.append(composed, { name: `invite-${universal.code}.png` });
      await archive.finalize();
    } catch (e) {
      archive.emit("error", e as any);
    } finally {
      // Clean up temp template file
      if (tempTemplatePath) {
        try {
          await unlink(tempTemplatePath);
        } catch (cleanupError) {
          console.warn("Error cleaning up temp template file:", cleanupError);
        }
      }
    }
  })();

  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="reservation-${reservationId}-invites.zip"`,
  });
  return new NextResponse(stream as any, { status: 200, headers });
}
