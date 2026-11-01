import { NextRequest } from "next/server";
import sharp from "sharp";
import { apiError, apiOk } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { uploadInvitationTemplate } from "@/lib/invitations/template-assets";
import { INVITATION_POLICY as P } from "@/lib/invitations/policy";
import { checkRateLimit } from "@/lib/rateLimit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const operator = await invitationOperator(req, true);
    if (!operator) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
    const limit = checkRateLimit(`invitation:upload:${operator.userId}`);
    if (!limit.ok) return apiError("RATE_LIMITED", "Intenta nuevamente", undefined, 429);
    const body = await req.formData(),
      file = body.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > P.maxUploadBytes ||
      !["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)
    )
      return apiError("BAD_REQUEST", "Archivo de imagen no permitido", undefined, 400);
    let optimized: Buffer;
    try {
      optimized = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: P.maxPixels,
      })
        .rotate()
        .resize(P.templateWidth, P.templateHeight, { fit: "cover", position: "center" })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      return apiError("BAD_REQUEST", "La imagen no se puede procesar", undefined, 400);
    }
    if (optimized.length > P.maxUploadBytes)
      return apiError("BAD_REQUEST", "La imagen supera el tamaño permitido", undefined, 400);
    return apiOk({ url: await uploadInvitationTemplate(optimized) });
  } catch (error) {
    return invitationFailure(error);
  }
}
