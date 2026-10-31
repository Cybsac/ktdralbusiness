import { randomUUID } from "crypto";
import { ZodError } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { downloadBatch } from "@/lib/prize-games/batch-export";
import { gameFailure } from "@/lib/prize-games/http";
import { issueGameBatch } from "@/lib/prize-games/issuance";
import { requirePrizeManagement } from "@/lib/prize-games/management-access";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const gate = await requirePrizeManagement(req);
  if (gate) return gate;
  const key = req.headers.get("idempotency-key") || randomUUID();
  try {
    const body = await req.json();
    const actor = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
    const result = await issueGameBatch(body, key, actor?.userId);
    const url = `/api/batch/${result.batch.id}/download?qr=1`;
    if (req.headers.get("accept")?.includes("application/json"))
      return apiOk(
        {
          batchId: result.batch.id,
          status: "COMPLETED",
          reused: result.reused,
          totalTokens: result.snapshot.totalTokens,
          downloadUrl: url,
          operationKey: key,
        },
        200,
        { "X-Emission-Key": key, "Cache-Control": "no-store" }
      );
    return await downloadBatch(
      result.batch.id,
      req.url,
      result.snapshot.request.includeQr && !result.snapshot.request.lazyQr,
      key
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError)
      return apiError("INVALID_BODY", "Revisa los datos de generación", undefined, 400);
    return gameFailure(error);
  }
}
