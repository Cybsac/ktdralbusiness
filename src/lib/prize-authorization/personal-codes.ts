import { PRIZE_CODE_SPACE } from "./code-format";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";

import { prisma } from "@/lib/prisma";

import { generatePrizeCode, policyWindow } from "./code";
import { policySchema } from "./policy";

export const hashPrizeCode = (code: string) => createHash("sha256").update(code).digest("hex");
export function personalPrizeCode(
  secret: string,
  revision: number,
  configRevision: number,
  period: string,
  nonce: number
) {
  return generatePrizeCode(secret, revision, `${configRevision}:${period}:${nonce}`);
}

// Serialize allocation and configuration changes through the same row lock.
// A unique hash index is the last line of defense against ambiguous identities.
export async function lockPrizeConfiguration(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT "id" FROM "PrizeAuthorizationConfig" WHERE "id" = 'default' FOR UPDATE`;
  return tx.prizeAuthorizationConfig.findUnique({ where: { id: "default" } });
}

export async function currentPersonalCodes(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const config = await lockPrizeConfiguration(tx);
    if (!config) throw new Error("PRIZE_AUTH_SETUP_REQUIRED");
    const policy = policySchema.parse(config.policy);
    const window = policyWindow(policy, "tokens", now);
    const credentials = await tx.prizeAuthorizationCredential.findMany({
      where: { enabled: true, user: { person: { active: true } } },
      include: {
        code: true,
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            person: { select: { name: true, active: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });
    const occupied = new Set(
      (await tx.prizeAuthorizationCode.findMany({ select: { codeHash: true } })).map(
        (row) => row.codeHash
      )
    );
    const result = [];
    const writes: Prisma.PrizeAuthorizationCodeCreateManyInput[] = [];
    for (const credential of credentials) {
      let row = credential.code;
      if (
        !row ||
        row.period !== window.period ||
        row.configRevision !== config.revision ||
        row.credentialRevision !== credential.revision ||
        row.codeHash !==
          hashPrizeCode(
            personalPrizeCode(
              credential.secret,
              credential.revision,
              config.revision,
              `${config.secret}:${window.period}`,
              row.nonce
            )
          )
      ) {
        let nonce = 0;
        let codeHash: string;
        // Each active collaborator receives a different personal code. Never reuse
        // their preceding code when rotating, even if the HMAC happens to collide.
        do {
          if (nonce >= PRIZE_CODE_SPACE) throw new Error("PRIZE_CODE_CAPACITY");
          codeHash = hashPrizeCode(
            personalPrizeCode(
              credential.secret,
              credential.revision,
              config.revision,
              `${config.secret}:${window.period}`,
              nonce++
            )
          );
        } while (occupied.has(codeHash));
        const data = {
          codeHash,
          period: window.period,
          configRevision: config.revision,
          credentialRevision: credential.revision,
          nonce: nonce - 1,
        };
        row = { credentialId: credential.id, ...data };
        writes.push(row);
        occupied.add(codeHash);
      }
      result.push({
        userId: credential.userId,
        credentialId: credential.id,
        revision: credential.revision,
        username: credential.user.username,
        name: credential.user.person.name,
        role: credential.user.role,
        code: personalPrizeCode(
          credential.secret,
          credential.revision,
          config.revision,
          `${config.secret}:${window.period}`,
          row.nonce
        ),
      });
    }
    if (writes.length)
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PrizeAuthorizationCode" ("credentialId", "codeHash", "period", "configRevision", "credentialRevision", "nonce")
      VALUES ${Prisma.join(writes.map((row) => Prisma.sql`(${row.credentialId}, ${row.codeHash}, ${row.period}, ${row.configRevision}, ${row.credentialRevision}, ${row.nonce})`))}
      ON CONFLICT ("credentialId") DO UPDATE SET
        "codeHash" = EXCLUDED."codeHash", "period" = EXCLUDED."period",
        "configRevision" = EXCLUDED."configRevision", "credentialRevision" = EXCLUDED."credentialRevision", "nonce" = EXCLUDED."nonce"
    `);
    return { policy, window, configRevision: config.revision, collaborators: result };
  });
}
