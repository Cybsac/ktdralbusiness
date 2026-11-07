import { NextRequest } from "next/server";
import sharp from "sharp";

import { apiError, apiOk } from "@/lib/apiError";
import { birthdayPackAdministrator } from "@/lib/birthdays/managementAuth";
import { BIRTHDAY_TEMPLATES_BUCKET, supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const key = "newversioncard.webp";
const maxBytes = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!(await birthdayPackAdministrator(req)))
    return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return apiError(
      "STORAGE_NOT_CONFIGURED",
      "El almacenamiento no está configurado para actualizar la plantilla",
      undefined,
      503
    );
  if (Number(req.headers.get("content-length")) > maxBytes + 65536)
    return apiError("INVALID_FILE", "Selecciona una imagen de hasta 10 MB", undefined, 400);
  try {
    const form = await req.formData();
    const file = form.get("template");
    if (!(file instanceof File) || !file.size || file.size > maxBytes)
      return apiError("INVALID_FILE", "Selecciona una imagen de hasta 10 MB", undefined, 400);
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
    const meta = await image.metadata();
    if (
      !meta.width ||
      !meta.height ||
      !["jpeg", "png", "webp"].includes(meta.format || "") ||
      (meta.pages || 1) !== 1 ||
      meta.width * 16 !== meta.height * 9 ||
      meta.width < 1080
    ) {
      return apiError(
        "INVALID_IMAGE",
        "Usa una imagen JPG, PNG o WebP vertical 9:16 de al menos 1080 × 1920 píxeles",
        undefined,
        400
      );
    }
    const output = await image.rotate().resize(1080, 1920).webp({ quality: 90 }).toBuffer();
    const { error } = await supabaseAdmin.storage
      .from(BIRTHDAY_TEMPLATES_BUCKET)
      .upload(key, output, { contentType: "image/webp", upsert: true, cacheControl: "0" });
    if (error) throw error;
    return apiOk({ saved: true });
  } catch (error) {
    console.error("[birthday template] upload failed", error);
    return apiError(
      "TEMPLATE_UPLOAD_FAILED",
      "No se pudo guardar la plantilla. Verifica que la imagen sea válida y vuelve a intentarlo.",
      undefined,
      500
    );
  }
}
