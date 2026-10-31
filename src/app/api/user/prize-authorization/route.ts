import { apiError, apiOk } from "@/lib/apiError";
import { currentPersonalCodes } from "@/lib/prize-authorization/personal-codes";
import { getPrizeOperator } from "@/lib/prize-authorization/service";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const session = await getPrizeOperator(req);
  if (!session)
    return apiError(
      "UNAUTHORIZED",
      "Inicia sesión para consultar tu clave personal.",
      undefined,
      401
    );
  try {
    const current = await currentPersonalCodes();
    const own = current.collaborators.find((item) => item.userId === session.userId);
    return apiOk(
      {
        enabled: !!own,
        code: own?.code ?? null,
        name: own?.name ?? null,
        validUntil: current.window.validUntil,
        publicRedemptionOpen: current.window.required,
        timezone: current.policy.timezone,
      },
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch {
    return apiError(
      "CONFIG_UNAVAILABLE",
      "Administración debe configurar las claves personales.",
      undefined,
      503
    );
  }
}
