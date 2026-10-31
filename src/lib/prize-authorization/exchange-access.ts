import { apiError } from "@/lib/apiError";

import { getPrizeAdministrator } from "./service";

// Exchange authoring remains available to administrators; public publication is deferred.
// Reopening the public flow later must preserve the final prize authorization gate.
export async function requireExchangeWorkspace(req: Request) {
  if (await getPrizeAdministrator(req)) return null;
  return apiError(
    "EXCHANGE_PUBLIC_UNAVAILABLE",
    "El intercambio público no está disponible.",
    undefined,
    403
  );
}
