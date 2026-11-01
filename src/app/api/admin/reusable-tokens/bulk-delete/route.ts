import { deleteUnusedReusableTokens } from "@/lib/reusable-tokens/deletion";
import { z } from "zod";
import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

// POST /api/admin/reusable-tokens/bulk-delete
// body: { tokenIds: string[] }
export async function POST(req: NextRequest) {
  try {
    const sessionCookie = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(sessionCookie);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const parsed = z
      .object({ tokenIds: z.array(z.string().min(1)).min(1).max(REUSABLE_POLICY.maxBulkTokens) })
      .safeParse(await req.json());
    if (!parsed.success) return apiError("INVALID_INPUT", "Selección inválida", undefined, 400);
    const { deleted, skipped } = await deleteUnusedReusableTokens(parsed.data.tokenIds);
    return NextResponse.json({
      success: true,
      deleted,
      skipped,
      message: `${deleted} token(es) eliminado(s)${skipped > 0 ? `, ${skipped} omitido(s) por tener canjes` : ""}`,
    });
  } catch (error) {
    console.error("Error bulk deleting reusable tokens:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}
