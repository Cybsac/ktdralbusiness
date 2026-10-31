import { Prisma } from "@prisma/client";

import { apiError, apiOk } from "@/lib/apiError";
import { getSystemConfig } from "@/lib/config";
import { logEvent } from "@/lib/log";
import { getPrizeActor, requirePrizeAuthorization } from "@/lib/prize-authorization/service";
import { gameAvailability } from "@/lib/prize-games/availability";
import { gameAction } from "@/lib/prize-games/contracts";
import { gameFailure } from "@/lib/prize-games/http";
import { assertGameReservation, gameTokenInclude } from "@/lib/prize-games/reservations";
import { gameTransaction } from "@/lib/prize-games/transaction";
import { checkRateLimit } from "@/lib/rateLimit";
import { SECRET_MAP, verifyTokenSignature } from "@/lib/signing";
import { computeTokensEnabled } from "@/lib/tokensMode";

export async function POST(_req: Request, { params }: { params: { tokenId: string } }) {
  const prizeGate = await requirePrizeAuthorization(_req, "tokens");
  if (prizeGate) return prizeGate;

  const { tokenId } = params;
  // Rate limiting per IP
  const ipHeader =
    _req.headers.get("x-forwarded-for") || _req.headers.get("x-real-ip") || "unknown";
  const ip = ipHeader.split(",")[0].trim();
  const rl = checkRateLimit(`redeem:${ip}`);
  if (!rl.ok) {
    return apiError(
      "RATE_LIMIT",
      "Demasiadas solicitudes de canje. Intenta más tarde.",
      { retryAfterSeconds: rl.retryAfterSeconds },
      429,
      { "Retry-After": rl.retryAfterSeconds.toString() }
    );
  }
  const cfg = await getSystemConfig();
  const tz = process.env.TOKENS_TIMEZONE || "America/Lima";
  const scheduled = computeTokensEnabled({ now: new Date(), tz });
  if (!cfg.tokensEnabled) {
    await logEvent("REDEEM_BLOCKED", "Intento con sistema OFF", { tokenId });
    return apiError("SYSTEM_OFF", "Tokens deshabilitados temporalmente", { tokenId }, 423);
  }
  // Option B: si el sistema está ON (override manual), permitimos canje aunque no sea ventana horaria programada
  if (!scheduled.enabled) {
    await logEvent("REDEEM_OVERRIDE_WINDOW", "Redención fuera de ventana (override manual ON)", {
      tokenId,
      tz,
    });
  }
  // Transacción: validación + update condicional para evitar doble redención
  try {
    const result = await gameTransaction(async (tx) => {
      const token = await tx.token.findUnique({
        where: { id: tokenId },
        include: gameTokenInclude,
      });
      if (!token) {
        await logEvent("REDEEM_NOT_FOUND", "Token no encontrado", { tokenId }, tx as any);
        return {
          status: 404,
          body: { code: "NOT_FOUND", message: "Token no encontrado" },
        } as const;
      }
      if (token.disabled || !token.prize.active) {
        await logEvent(
          "REDEEM_INACTIVE",
          "Token o premio inactivo",
          { tokenId, prizeId: token.prizeId },
          tx as any
        );
        return {
          status: 410,
          body: { code: "INACTIVE", message: "Token/Premio inactivo" },
        } as const;
      }
      // Ventana horaria (validFrom): si existe y aún no se alcanza, bloquear
      const anyToken: any = token as any;
      if (anyToken.validFrom && Date.now() < new Date(anyToken.validFrom).getTime()) {
        await logEvent(
          "REDEEM_TOO_EARLY",
          "Intento de redención antes de validFrom",
          { tokenId, prizeId: token.prizeId, validFrom: anyToken.validFrom },
          tx as any
        );
        return { status: 409, body: { code: "TOO_EARLY", message: "Aún no disponible" } } as const;
      }
      if (Date.now() > token.expiresAt.getTime()) {
        await logEvent(
          "REDEEM_EXPIRED",
          "Token expirado",
          { tokenId, prizeId: token.prizeId },
          tx as any
        );
        return { status: 410, body: { code: "EXPIRED", message: "Expirado" } } as const;
      }

      const unavailable = gameAvailability(token);
      if (unavailable)
        return {
          status: unavailable.status,
          body: { code: unavailable.code, message: unavailable.message },
        };
      if (gameAction(token.prize.key) !== "PRIZE")
        return {
          status: 409,
          body: { code: "NO_DELIVERABLE_PRIZE", message: "Este resultado no requiere entrega" },
        };
      await assertGameReservation(tx, token);
      // Verificación de firma
      const version = (token as any).signatureVersion || 1;
      const secret = SECRET_MAP[version];
      if (!secret) {
        await logEvent(
          "REDEEM_UNKNOWN_SIG_VERSION",
          "Versión firma desconocida",
          { tokenId, prizeId: token.prizeId, version },
          tx as any
        );
        return {
          status: 409,
          body: { code: "UNKNOWN_SIGNATURE_VERSION", message: "Versión de firma no soportada" },
        } as const;
      }
      const sigOk = verifyTokenSignature(
        secret,
        token.id,
        token.prizeId,
        token.expiresAt,
        token.signature,
        version
      );
      if (!sigOk) {
        await tx.token.update({ where: { id: token.id }, data: { disabled: true } });
        await logEvent(
          "REDEEM_BAD_SIGNATURE",
          "Firma inválida token; deshabilitado",
          { tokenId, prizeId: token.prizeId },
          tx as any
        );
        return { status: 409, body: { code: "BAD_SIGNATURE", message: "Firma inválida" } } as const;
      }

      // Intento atómico: solo actualiza si aún no tiene redeemedAt
      const now = new Date();
      const updated = await tx.token.updateMany({
        where: {
          id: tokenId,
          redeemedAt: null,
          deliveredAt: null,
          disabled: false,
          expiresAt: { gt: now },
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ startTime: null }, { startTime: { lte: now } }] },
            { OR: [{ endTime: null }, { endTime: { gt: now } }] },
          ],
        },
        data: { redeemedAt: now, deliveredByUserId: getPrizeActor(_req).userId },
      });
      if (updated.count === 0) {
        await logEvent(
          "REDEEM_DUP",
          "Token ya redimido (race)",
          { tokenId, prizeId: token.prizeId },
          tx as any
        );
        return { status: 409, body: { code: "ALREADY_REDEEMED", message: "Ya redimido" } } as const;
      }
      return {
        status: 200,
        body: { ok: true, prize: token.prize, redeemedAt: now, signatureVersion: version },
      } as const;
    });
    if (result.status === 200) {
      await logEvent("REDEEM_OK", "Token redimido", {
        tokenId,
        responsible: getPrizeActor(_req),
        signatureVersion: (result as any)?.body?.signatureVersion,
      });
    }
    if (result.status === 200) return apiOk(result.body, 200);
    return apiError(
      result.body.code || "REDEEM_FAILED",
      result.body.message,
      { tokenId },
      result.status
    );
  } catch (e: any) {
    if (e instanceof Error && "code" in e && "status" in e) return gameFailure(e);
    await logEvent("REDEEM_ERROR", "Excepción en redeem", { tokenId, message: e?.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return apiError("DB_ERROR", "Error de base de datos", { tokenId }, 500);
    }
    return apiError("TX_FAIL", "Fallo transaccional", { tokenId }, 500);
  }
}
