import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { supabaseAdmin } from "@/lib/supabase-server";
import { WELCOME_ATTRACT_IMAGE_EFFECTS, WELCOME_ATTRACT_IMAGE_MAX_BYTES, WELCOME_ATTRACT_VIDEO_MAX_BYTES } from "@/lib/welcomeplayers/attract";
import { assetKeys, attractPublicConfig, readAttractManifest, writeAttractManifest, WELCOME_ATTRACT_STORAGE_BUCKET } from "@/lib/welcomeplayers/attract-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function allowed(req: Request) {
  const actor = await getPrizeOperator(req);
  return actor && ["ADMIN", "COORDINATOR"].includes(actor.role);
}

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 403);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return apiError("STORAGE_NOT_CONFIGURED", "El almacenamiento no está configurado.", undefined, 503);
  if (Number(req.headers.get("content-length")) > WELCOME_ATTRACT_VIDEO_MAX_BYTES + 65536) return apiError("INVALID_FILE", "El archivo supera el tamaño permitido.", undefined, 400);
  try {
    const form = await req.formData();
    const file = form.get("media");
    if (!(file instanceof File) || !file.size || file.size > WELCOME_ATTRACT_VIDEO_MAX_BYTES) return apiError("INVALID_FILE", "Selecciona una imagen o un video válido.", undefined, 400);
    let buffer = Buffer.from(await file.arrayBuffer());
    let key: string, contentType: string, mediaType: "image" | "video";
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      if (file.size > WELCOME_ATTRACT_IMAGE_MAX_BYTES) return apiError("INVALID_FILE", "La imagen supera el tamaño permitido.", undefined, 400);
      const image = sharp(buffer, { limitInputPixels: 40_000_000, animated: false });
      const meta = await image.metadata();
      if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format || "") || (meta.pages || 1) !== 1 || Math.abs(meta.width / meta.height - 9 / 16) > 0.02) return apiError("INVALID_IMAGE", "Usa una imagen vertical 9:16 en JPG, PNG o WebP.", undefined, 400);
      buffer = await image.rotate().resize(1080, 1920, { fit: "contain", background: "#000000" }).webp({ quality: 82 }).toBuffer();
      key = assetKeys.image; contentType = "image/webp"; mediaType = "image";
    } else if (file.type === "video/mp4" && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
      key = assetKeys.mp4; contentType = "video/mp4"; mediaType = "video";
    } else if (file.type === "video/webm" && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      key = assetKeys.webm; contentType = "video/webm"; mediaType = "video";
    } else return apiError("INVALID_FILE", "Usa una imagen JPG, PNG o WebP, o un video MP4 o WebM.", undefined, 400);
    const previous = await readAttractManifest();
    const { error } = await supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).upload(key, buffer, { contentType, upsert: true, cacheControl: "0" });
    if (error) throw error;
    const manifest = { enabled: true, key, mediaType, revision: randomUUID(), imageEffect: previous?.imageEffect || "none" } as Parameters<typeof writeAttractManifest>[0];
    await writeAttractManifest(manifest);
    return apiOk({ config: attractPublicConfig(manifest) });
  } catch (error) {
    console.error("[welcomeplayers] Error al guardar pantalla de espera", error);
    return apiError("UPLOAD_FAILED", "No se pudo guardar el archivo. Verifica su formato y vuelve a intentarlo.", undefined, 500);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await allowed(req))) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 403);
  const parsed = z.object({ enabled: z.boolean().optional(), imageEffect: z.enum(WELCOME_ATTRACT_IMAGE_EFFECTS).optional() }).strict().refine((data) => data.enabled !== undefined || data.imageEffect !== undefined).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "Selecciona un estado válido.", undefined, 400);
  try {
    const manifest = await readAttractManifest();
    if (!manifest) return apiError("NO_MEDIA", "Primero carga una imagen o video.", undefined, 400);
    const updated = { ...manifest, ...parsed.data };
    await writeAttractManifest(updated);
    return apiOk({ config: attractPublicConfig(updated) });
  } catch {
    return apiError("SAVE_FAILED", "No se pudo actualizar la pantalla de bienvenida.", undefined, 500);
  }
}
