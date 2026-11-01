import { birthdayFailure } from "@/lib/birthdays/http";
import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk } from "@/lib/apiError";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { generateInviteTokens, listTokens } from "@/lib/birthdays/service";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const tokens = await listTokens(params.id);
  return apiOk({ items: tokens });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
  const { searchParams } = new URL(req.url);
  const schema = z.object({
    force: z.union([z.literal("1"), z.literal("true")]).optional(),
    expectedUpdatedAt: z.string().optional(),
  });
  const parsed = schema.safeParse({
    force: searchParams.get("force") || undefined,
    expectedUpdatedAt: searchParams.get("expectedUpdatedAt") || undefined,
  });
  if (!parsed.success)
    return apiError("INVALID_QUERY", "Validation failed", parsed.error.flatten(), 400);
  const force = Boolean(parsed.data.force);
  const expectedUpdatedAt = parsed.data.expectedUpdatedAt;
  try {
    return apiOk({
      items: await generateInviteTokens(params.id, { force, expectedUpdatedAt }, session.userId),
    });
  } catch (error) {
    return birthdayFailure(error);
  }
}
