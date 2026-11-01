import { assertBirthdayCardAvailable } from "@/lib/birthdays/card-policy";
import { birthdayFailure } from "@/lib/birthdays/http";
export const runtime = "nodejs"; // necesario para usar fs/sharp (evitar Edge runtime sin acceso a filesystem)
import { NextRequest } from "next/server";
import { getBirthdayQrBaseUrl } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { generateInviteCard } from "@/lib/birthdays/generateInviteCard";
import { apiError } from "@/lib/apiError";

// GET /api/birthdays/invite/:code/card?fmt=webp|png
// Returns a composed vertical invite card with embedded QR.
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const { searchParams } = new URL(req.url);
  const fmt = (searchParams.get("fmt") === "png" ? "png" : "webp") as "png" | "webp";
  try {
    const token = await prisma.inviteToken.findUnique({
      where: { code: params.code },
      include: { reservation: true },
    });
    if (!token) return apiError("NOT_FOUND", "Token no encontrado", undefined, 404);
    assertBirthdayCardAvailable(token.reservation);
    const kind = token.kind === "host" ? "host" : "guest";
    // Public redeem URL (short path /b/:code already exists)
    const base = getBirthdayQrBaseUrl(req.url);
    const redeemUrl = `${base}/b/${encodeURIComponent(token.code)}`;
    // Derive celebrant first name from reservation if available
    const celebrantFull = (token as any).reservation?.celebrantName || "";
    const celebrantFirst = celebrantFull.trim().split(/\s+/)[0] || celebrantFull;
    const reservationDateISO = (token as any).reservation?.date
      ? (token as any).reservation.date.toISOString()
      : undefined;
    const buf = await generateInviteCard(
      kind,
      token.code,
      redeemUrl,
      fmt,
      celebrantFirst,
      reservationDateISO
    );
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": fmt === "png" ? "image/png" : "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return birthdayFailure(error);
  }
}
