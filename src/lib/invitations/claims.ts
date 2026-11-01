import { Prisma } from "@prisma/client";
import { signInvitationClaim, buildDefaultInvitationClaim } from "./token";
/** One database update per batch; codes and claims are always committed together. */
export async function persistInvitationClaims(
  tx: Prisma.TransactionClient,
  eventId: string,
  rows: Array<{ id: string; code: string }>,
  expiresAt: Date,
  assignCodes = false
) {
  if (!rows.length) return;
  const values = rows.map(
    (row) =>
      Prisma.sql`(${row.id}::text,${row.code}::text,${JSON.stringify(signInvitationClaim(buildDefaultInvitationClaim(eventId, row.id, row.code, expiresAt)))}::text)`
  );
  const codeAssignment = assignCodes
    ? Prisma.sql`code=source.code,status='confirmed',`
    : Prisma.empty;
  const condition = assignCodes ? Prisma.sql`AND target.code IS NULL` : Prisma.empty;
  await tx.$executeRaw(
    Prisma.sql`UPDATE "SpecialInvitation" AS target SET ${codeAssignment} claim=source.claim,"expiresAt"=${expiresAt},"updatedAt"=CURRENT_TIMESTAMP FROM (VALUES ${Prisma.join(values)}) AS source(id,code,claim) WHERE target.id=source.id AND target."eventId"=${eventId} ${condition}`
  );
}
