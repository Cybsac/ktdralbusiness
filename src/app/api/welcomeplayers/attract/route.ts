import { apiError, apiOk } from "@/lib/apiError";
import { attractPublicConfig, readAttractManifest } from "@/lib/welcomeplayers/attract-storage";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return apiOk({ config: attractPublicConfig(await readAttractManifest()) }, 200, { "Cache-Control": "no-store" });
  } catch {
    return apiError("WELCOME_ATTRACT_UNAVAILABLE", "No se pudo cargar la pantalla de bienvenida.", undefined, 503, { "Cache-Control": "no-store" });
  }
}
