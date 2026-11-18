import { apiError, apiOk } from "@/lib/apiError";
import { readWelcomeMessage } from "@/lib/welcomeplayers/message-storage";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return apiOk({ message: await readWelcomeMessage() }, 200, { "Cache-Control": "no-store" }); }
  catch { return apiError("MESSAGE_UNAVAILABLE", "No se pudo cargar el mensaje.", undefined, 503, { "Cache-Control": "no-store" }); }
}
