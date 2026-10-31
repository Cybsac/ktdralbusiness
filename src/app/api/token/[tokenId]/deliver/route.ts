import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/apiError";
import { isTwoPhaseRedemptionEnabled } from "@/lib/featureFlags";
import { logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { getPrizeActor, requirePrizeAuthorization } from "@/lib/prize-authorization/service";
import { gameAvailability } from "@/lib/prize-games/availability";
import { gameAction } from "@/lib/prize-games/contracts";

// POST /api/token/[tokenId]/deliver
// Body: (none required for now)
// Response (success): { phase: 'DELIVERED', tokenId, prizeId, timings: { revealToDeliverMs }, timestamps: { revealedAt, deliveredAt } }
// Error codes: TOKEN_NOT_FOUND, NOT_REVEALED, ALREADY_DELIVERED, TWO_PHASE_DISABLED

export async function POST(_req: NextRequest, { params }: { params: { tokenId: string } }) {
  const prizeGate = await requirePrizeAuthorization(_req, "tokens");
  if (prizeGate) return prizeGate;

  const { tokenId } = params;
  if (!tokenId) {
    return apiError("TOKEN_ID_REQUIRED", "tokenId requerido", undefined, 400);
  }

  const twoPhase = isTwoPhaseRedemptionEnabled();
  if (!twoPhase) {
    return apiError("TWO_PHASE_DISABLED", "Flujo two-phase desactivado", undefined, 409);
  }

  const session = getPrizeActor(_req);

  try {
    let deliveryNote: string | null = null;
    try {
      const body = await _req.json();
      if (body && typeof body.deliveryNote === "string") {
        deliveryNote = body.deliveryNote.trim();
        if (deliveryNote && deliveryNote.length > 600) deliveryNote = deliveryNote.slice(0, 600);
      }
    } catch {
      /* no body */
    }
    const result = await (prisma as any).$transaction(async (tx: any) => {
      // 1. Leer estado actual incluyendo información del batch
      const token = await tx.token.findUnique({
        where: { id: tokenId },
        select: {
          id: true,
          prizeId: true,
          disabled: true,
          expiresAt: true,
          validFrom: true,
          startTime: true,
          endTime: true,
          redeemedAt: true,
          prize: { select: { key: true, active: true } },
          revealedAt: true,
          deliveredAt: true,
          assignedPrizeId: true,
          batch: {
            select: {
              staticTargetUrl: true,
              functionalDate: true,
            },
          },
        },
      });
      if (!token)
        return {
          status: 404,
          body: { code: "TOKEN_NOT_FOUND", message: "Token no encontrado" },
        } as const;
      // Disabling prize issuance does not revoke an already revealed entitlement.
      const unavailable = gameAvailability({ ...token, prize: undefined });
      if (unavailable)
        return {
          status: unavailable.status,
          body: { code: unavailable.code, message: unavailable.message },
        };
      if (token.prize && gameAction(token.prize.key) !== "PRIZE")
        return {
          status: 409,
          body: { code: "NO_DELIVERABLE_PRIZE", message: "Este resultado no requiere entrega" },
        };
      if (token.redeemedAt && !token.deliveredAt)
        return { status: 409, body: { code: "ALREADY_REDEEMED", message: "Token ya canjeado" } };
      if (!token.revealedAt)
        return {
          status: 409,
          body: { code: "NOT_REVEALED", message: "Token no revelado" },
        } as const;
      if (token.deliveredAt)
        return {
          status: 409,
          body: { code: "ALREADY_DELIVERED", message: "Ya entregado" },
        } as const;

      // 2. Determinar si es un lote estático
      const isStaticBatch = !!(
        token.batch?.staticTargetUrl && token.batch.staticTargetUrl.trim() !== ""
      );

      // 3. Intento de actualización atómica condicionada deliveredAt IS NULL para evitar race
      const deliveredAt = new Date();
      const revealToDeliverMs = deliveredAt.getTime() - token.revealedAt.getTime();
      const deliveredByUserId = session.userId;

      // Para cualquier token entregado: marcar como canjeado automáticamente
      const updateData = {
        deliveredAt,
        redeemedAt: deliveredAt, // Auto-canje para todos los tokens entregados
        deliveredByUserId,
        deliveryNote,
        assignedPrizeId: token.assignedPrizeId ?? token.prizeId,
      };

      const updateRes = await tx.token.updateMany({
        where: {
          id: tokenId,
          deliveredAt: null,
          redeemedAt: null,
          revealedAt: { not: null },
          disabled: false,
          expiresAt: { gt: deliveredAt },
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: deliveredAt } }] },
            { OR: [{ startTime: null }, { startTime: { lte: deliveredAt } }] },
            { OR: [{ endTime: null }, { endTime: { gt: deliveredAt } }] },
          ],
        },
        data: updateData,
      });

      if (updateRes.count !== 1) {
        // Recheck after a concurrent change; never retry an invalid delivery.
        const current = await tx.token.findUnique({
          where: { id: tokenId },
          select: { disabled: true, expiresAt: true, deliveredAt: true },
        });
        if (current?.disabled)
          return {
            status: 409,
            body: { code: "INACTIVE", message: "Token deshabilitado" },
          } as const;
        if (current && current.expiresAt.getTime() <= Date.now())
          return { status: 410, body: { code: "EXPIRED", message: "Token expirado" } } as const;
        if (current?.deliveredAt)
          return {
            status: 409,
            body: { code: "ALREADY_DELIVERED", message: "Ya entregado" },
          } as const;
        return {
          status: 409,
          body: {
            code: "DELIVERY_CONFLICT",
            message: "El estado del token cambió. Actualiza e intenta nuevamente.",
          },
        } as const;
      }

      // 3. Releer para respuesta
      const updated = await tx.token.findUnique({
        where: { id: tokenId },
        select: {
          id: true,
          prizeId: true,
          assignedPrizeId: true,
          revealedAt: true,
          deliveredAt: true,
          deliveryNote: true,
        },
      });
      if (!updated)
        return {
          status: 500,
          body: { code: "DELIVER_STATE_LOST", message: "Estado perdido" },
        } as const;

      return {
        status: 200,
        body: {
          phase: "DELIVERED",
          tokenId: updated.id,
          prizeId: updated.assignedPrizeId || updated.prizeId,
          timings: { revealToDeliverMs },
          timestamps: { revealedAt: updated.revealedAt, deliveredAt: updated.deliveredAt },
          deliveryNote: updated.deliveryNote || deliveryNote || null,
          isStaticBatch,
          autoRedeemed: isStaticBatch,
        },
        log: {
          type: "TOKEN_DELIVERED",
          message: isStaticBatch
            ? "Token estático entregado y auto-canjeado"
            : "Token delivered (two-phase)",
          metadata: {
            responsible: session,
            tokenId: updated.id,
            prizeId: updated.prizeId,
            assignedPrizeId: updated.assignedPrizeId,
            revealToDeliverMs,
            deliveryNote,
            isStaticBatch,
            autoRedeemed: isStaticBatch,
          },
        },
      } as const;
    });

    if (result.status === 200 && (result as any).log) {
      const l = (result as any).log;
      logEvent(l.type, l.message, l.metadata).catch(() => {});
    }

    if ("code" in result.body || "error" in result.body) {
      const code = (result.body as any).code || (result.body as any).error;
      return apiError(code, (result.body as any).message || code, undefined, result.status);
    }
    return apiOk(result.body, result.status);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TOKEN_DELIVER_ERROR]", e);
    return apiError("DELIVER_FAILED", "Entrega fallida", undefined, 500);
  }
}
