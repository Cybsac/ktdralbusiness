import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { lockEvent } from "./locking";
import { assertEventAvailable, invitationExpiration } from "./calendar";
import { INVITATION_POLICY as P } from "./policy";
import { persistInvitationClaims } from "./claims";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function generateInvitationCodes(eventId: string, _options?: { force?: boolean }) {
  return prisma.$transaction(
    async (tx) => {
      await lockEvent(tx, eventId);
      const event = await tx.specialEvent.findUniqueOrThrow({ where: { id: eventId } });
      assertEventAvailable(event);
      const invitations = await tx.specialInvitation.findMany({
        where: { eventId },
        orderBy: { id: "asc" },
      });
      const pending = invitations.filter(
        (inv) => !inv.code && !inv.arrivedAt && inv.status !== "cancelled"
      );
      if (!pending.length) return invitations;
      // All code allocators take this lock. Collision checks are batched, never per guest.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('special-invitation-code-allocation'))::text`;
      for (let attempt = 0; attempt < P.codeAttempts; attempt++) {
        const codes = new Set<string>();
        const rows = pending.map((inv) => {
          let code: string;
          do {
            code = Array.from(
              { length: P.codeLength },
              () => alphabet[randomInt(alphabet.length)]
            ).join("");
          } while (codes.has(code));
          codes.add(code);
          return { id: inv.id, code };
        });
        if (
          await tx.specialInvitation.findFirst({
            where: { code: { in: [...codes] } },
            select: { id: true },
          })
        )
          continue;
        await persistInvitationClaims(tx, eventId, rows, invitationExpiration(event.date), true);
        return tx.specialInvitation.findMany({ where: { eventId }, orderBy: { id: "asc" } });
      }
      throw new Error("CODE_GENERATION_FAILED");
    },
    { timeout: P.transactionTimeoutMs }
  );
}
