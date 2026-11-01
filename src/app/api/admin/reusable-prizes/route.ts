import { REUSABLE_POLICY } from "@/lib/reusable-tokens/policy";
import { createReusablePrize } from "@/lib/reusable-prizes/service";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieFromRequest, verifySessionCookie, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

export async function GET(req: NextRequest) {
  try {
    const raw = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(raw);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const prizes = await prisma.reusablePrize.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(prizes);
  } catch (error) {
    console.error("Error fetching reusable prizes:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = getSessionCookieFromRequest(req);
    const session = await verifySessionCookie(raw);
    const auth = requireRole(session, [...REUSABLE_POLICY.managementRoles]);
    if (!auth.ok) {
      return apiError("UNAUTHORIZED", auth.error || "No autorizado");
    }

    const { label, description } = await req.json();
    if (typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "Nombre del premio requerido" }, { status: 400 });
    }
    if (description != null && typeof description !== "string") {
      return NextResponse.json({ error: "Descripción inválida" }, { status: 400 });
    }
    const prize = await createReusablePrize({
      label: label.trim(),
      description: description?.trim() || null,
    });

    return NextResponse.json(prize);
  } catch (error) {
    console.error("Error creating reusable prize:", error);
    return apiError("INTERNAL_ERROR", "Error interno");
  }
}
