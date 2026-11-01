import { deleteUnusedReusableTokens } from "@/lib/reusable-tokens/deletion";
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

export async function DELETE(req: NextRequest, { params }: { params: { tokenId: string } }) {
  try {
    const sessionCookie = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const { tokenId } = params;

    // Verificar que el token existe
    const token = await prisma.reusableToken.findUnique({
      where: { id: tokenId },
      select: { id: true, usedCount: true, maxUses: true },
    });

    if (!token) {
      return apiError("NOT_FOUND", "Token no encontrado");
    }

    const { deleted } = await deleteUnusedReusableTokens([tokenId]);
    if (!deleted)
      return apiError(
        "TOKEN_IN_USE",
        "No se puede eliminar un token con usos o historial",
        undefined,
        409
      );

    return NextResponse.json({ success: true, message: "Token eliminado exitosamente" });
  } catch (error) {
    console.error("Error deleting reusable token:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}
