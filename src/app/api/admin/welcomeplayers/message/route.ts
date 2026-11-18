import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { WELCOME_PLAYERS_MESSAGE_MAX_LENGTH } from "@/lib/welcomeplayers/message";
import { writeWelcomeMessage } from "@/lib/welcomeplayers/message-storage";

export const runtime = "nodejs";
export async function PATCH(req: Request) {
  const actor = await getPrizeOperator(req);
  if (!actor || !["ADMIN", "COORDINATOR"].includes(actor.role)) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 403);
  const parsed = z.object({ message: z.string().trim().min(1).max(WELCOME_PLAYERS_MESSAGE_MAX_LENGTH) }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "Escribe un mensaje válido.", undefined, 400);
  try { return apiOk({ message: await writeWelcomeMessage(parsed.data.message) }); }
  catch { return apiError("SAVE_FAILED", "No se pudo guardar el mensaje.", undefined, 500); }
}
