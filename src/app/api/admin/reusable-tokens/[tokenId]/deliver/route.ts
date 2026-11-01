import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrizeAuthorization, getPrizeActor } from "@/lib/prize-authorization/service";
import { apiError } from "@/lib/apiError";
import { consumeReusableToken } from "@/lib/reusable-tokens/consumption";
import { reusableFailure } from "@/lib/reusable-tokens/http";
export async function POST(req: NextRequest, { params }: { params: { tokenId: string } }) {
  const gate = await requirePrizeAuthorization(req, "reusable");
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ operationKey: z.string().uuid().optional() }).safeParse(body);
  if (!parsed.success) return apiError("INVALID_INPUT", "Operación inválida", undefined, 400);
  try {
    const token = await consumeReusableToken(
      params.tokenId,
      getPrizeActor(req),
      parsed.data.operationKey,
      "deliver"
    );
    return NextResponse.json(
      {
        success: true,
        ok: true,
        tokenId: token.id,
        prizeId: token.prizeId,
        prize: token.prize,
        deliveredAt: token.deliveredAt,
        deliveredBy: token.deliveredByUserId,
        token: {
          id: token.id,
          prize: token.prize,
          usedCount: token.usedCount,
          maxUses: token.maxUses,
          remainingUses: token.maxUses - token.usedCount,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return reusableFailure(error);
  }
}
