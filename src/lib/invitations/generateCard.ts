import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { invitationDay } from "./calendar";
import { fetchInvitationTemplate } from "./template-fetch";
import { INVITATION_POLICY as P } from "./policy";
import { invitationTemplate } from "./templates";
import { generateQrPngBuffer } from "@/lib/qr-server";

function escapeXml(s: string) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

/**
 * Generate a composed invitation card image:
 *   template (1080×1920) + QR overlay + guest-name text + event-date text
 */
export async function generateInvitationCard(opts: {
  redeemUrl: string;
  guestName: string;
  eventDate: Date | string;
  templateUrl?: string | null;
  format?: "png" | "webp";
  prepared?: Awaited<ReturnType<typeof prepareInvitationCard>>;
}): Promise<Buffer> {
  const tpl = invitationTemplate;
  const fmt = opts.format ?? "png";

  const { templateBuf, embeddedFontCss } =
    opts.prepared || (await prepareInvitationCard(opts.templateUrl));

  // ── 2. QR ─────────────────────────────────────────────────────────────
  const qrSize = tpl.qr.size; // 460 px
  const qrLeft = tpl.qr.left; // 310 px from left
  const qrTop = tpl.qr.top; // 621 px from top
  const qrPng = await generateQrPngBuffer(opts.redeemUrl, qrSize);

  // rounded corners on QR
  const cornerR = Math.round(qrSize * 0.08);
  const maskSvg = Buffer.from(
    `<svg width="${qrSize}" height="${qrSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${qrSize}" height="${qrSize}" rx="${cornerR}" ry="${cornerR}" fill="white"/></svg>`
  );
  const roundedQr = await sharp(qrPng)
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [{ input: roundedQr, top: qrTop, left: qrLeft }];

  const fontFamily = "'StretchProEmbed','Stretch Pro','Arial',sans-serif";

  // ── 4. Name bar (guest name) ──────────────────────────────────────────
  const nbW = tpl.nameBar.width; // 800 px
  const nbH = tpl.nameBar.height; // 120 px
  const nbLeft = tpl.nameBar.left; // 140 px from left
  const nbTop = tpl.nameBar.top; // 1121 px from top

  const nameUpper = opts.guestName.trim().toUpperCase();

  // Horizontal stretch: render text in a NARROW canvas, then stretch to full width
  // This makes each character ~1.4x wider than normal
  const NAME_SCALE_X = 1.4;
  const nameNarrowW = Math.round(nbW / NAME_SCALE_X); // ~571px virtual canvas
  const nameMaxW = Math.round(nameNarrowW * 0.88);
  const nameFont = Math.min(
    Math.round(nbH * 0.78),
    Math.max(18, Math.round(nameMaxW / (nameUpper.length * 0.82)))
  );

  // Render SVG at narrow width, then stretch to actual bar width → chars get wider
  const nameSvg = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg width="${nameNarrowW}" height="${nbH}" viewBox="0 0 ${nameNarrowW} ${nbH}" xmlns="http://www.w3.org/2000/svg">\n` +
      (embeddedFontCss ? `  <style>${embeddedFontCss}</style>\n` : "") +
      `  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" ` +
      `font-family="${fontFamily}" font-weight="600" font-size="${nameFont}px" ` +
      `fill="#FFB800">${escapeXml(nameUpper)}</text>\n` +
      `</svg>`
  );
  const nameRaster = await sharp(nameSvg, { density: 230 })
    .resize(nbW, nbH, { fit: "fill" })
    .png()
    .toBuffer();
  composites.push({ input: nameRaster, left: nbLeft, top: nbTop });

  // ── 5. Event bar (event date in Peru timezone) ────────────────────────
  const ebW = tpl.eventBar.width; // 800 px
  const ebH = tpl.eventBar.height; // 60 px
  const ebLeft = tpl.eventBar.left; // 140 px from left
  const ebTop = tpl.eventBar.top; // 1249 px from top

  // Format date in Peru timezone: "15 NOVIEMBRE 2025"
  const dateText = invitationDay(opts.eventDate)
    .setLocale("es")
    .toFormat("d LLLL yyyy")
    .toUpperCase();

  const evtMaxW = Math.round(ebW * 0.8);
  const evtFont = Math.min(
    Math.round(ebH * 0.65),
    Math.max(14, Math.round(evtMaxW / (dateText.length * 0.78)))
  );

  const evtSvg = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg width="${ebW}" height="${ebH}" viewBox="0 0 ${ebW} ${ebH}" xmlns="http://www.w3.org/2000/svg">\n` +
      (embeddedFontCss ? `  <style>${embeddedFontCss}</style>\n` : "") +
      `  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" ` +
      `font-family="${fontFamily}" font-weight="600" font-size="${evtFont}px" ` +
      `fill="#d4d4d4" letter-spacing="1">${escapeXml(dateText)}</text>\n` +
      `</svg>`
  );
  const evtRaster = await sharp(evtSvg, { density: 230 }).resize(ebW, ebH).png().toBuffer();
  composites.push({ input: evtRaster, left: ebLeft, top: ebTop });

  // ── 6. Compose ────────────────────────────────────────────────────────
  let base = sharp(templateBuf, { limitInputPixels: P.maxPixels });
  const meta = await base.metadata();
  if (meta.width !== tpl.width || meta.height !== tpl.height) {
    base = base.resize(tpl.width, tpl.height, { fit: "cover" });
  }

  const result = base.composite(composites);
  return fmt === "png"
    ? result.png({ compressionLevel: 9 }).toBuffer()
    : result.webp({ quality: 92 }).toBuffer();
}

async function _solidBackground(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 12, g: 12, b: 12, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

export async function prepareInvitationCard(templateUrl?: string | null) {
  const tpl = invitationTemplate;
  const sourceUrl = templateUrl || tpl.defaultUrl;
  const templateBuf = sourceUrl
    ? await fetchInvitationTemplate(sourceUrl)
    : await _solidBackground(tpl.width, tpl.height);
  await sharp(templateBuf, { limitInputPixels: P.maxPixels }).metadata();
  // ── 3. Embed font (same pattern as birthday cards that works) ─────────
  let embeddedFontCss = "";
  const fontPaths = [
    path.resolve(process.cwd(), "public", "fonts", "StretchPro.woff2"),
    path.resolve(process.cwd(), "fonts", "StretchPro.woff2"),
    path.resolve(__dirname, "..", "..", "..", "public", "fonts", "StretchPro.woff2"),
  ];
  for (const fp of fontPaths) {
    try {
      const buf = await fs.readFile(fp);
      embeddedFontCss = `@font-face{font-family:'StretchProEmbed';src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2');font-weight:400 700;font-display:swap;}`;
      break;
    } catch {
      /* try next */
    }
  }
  if (!embeddedFontCss) {
    console.warn("[invitationCard] StretchPro no encontrada, usando fallback");
  }
  return { templateBuf, embeddedFontCss };
}
