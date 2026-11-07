import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('hitos acumulados en PostgreSQL aislado', () => {
  it('importa histórico, reconoce hitos una vez y conserva o revierte las operaciones correctamente', async () => {
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE "User" (id text primary key); CREATE TABLE "Batch" (id text primary key, "staticTargetUrl" text, "isReusable" boolean); CREATE TABLE "Token" (id text primary key, "batchId" text, "deliveredAt" timestamp, "deliveredByUserId" text); CREATE TABLE "ReusableTokenRedemption" (id text primary key, "userId" text, type text, "createdAt" timestamp);');
      await db.exec(`INSERT INTO "User" VALUES ('u'); INSERT INTO "Batch" VALUES ('b', NULL, FALSE); INSERT INTO "ReusableTokenRedemption" SELECT 'r' || i, 'u', 'redeem', timestamp '2025-01-01' + i * interval '1 second' FROM generate_series(1,49) i; INSERT INTO "ReusableTokenRedemption" VALUES ('orphan', 'unknown', 'redeem', NOW()); INSERT INTO "Token" VALUES ('t', 'b', timestamp '2025-01-02', 'u');`);
      await db.exec(await readFile('prisma/migrations/20261102120000_activity_milestones/migration.sql', 'utf8'));
      let balance = await db.query<{ total: number }>('SELECT "total" FROM "ActivityBalance" WHERE "userId" = $1', ['u']);
      let awards = await db.query<{ threshold: number; points: number; revokedAt: string | null }>('SELECT "threshold", "points", "revokedAt" FROM "ActivityMilestoneAward" WHERE "userId" = $1 ORDER BY "threshold"', ['u']);
      expect(balance.rows[0].total).toBe(50);
      expect(awards.rows).toMatchObject([{ threshold: 50, points: 5, revokedAt: null }]);
      await db.exec(`UPDATE "Token" SET "deliveredAt" = NULL, "deliveredByUserId" = NULL WHERE id = 't';`);
      balance = await db.query('SELECT "total" FROM "ActivityBalance" WHERE "userId" = $1', ['u']);
      awards = await db.query('SELECT "threshold", "points", "revokedAt" FROM "ActivityMilestoneAward" WHERE "userId" = $1', ['u']);
      expect(balance.rows[0].total).toBe(49);
      expect(awards.rows[0].revokedAt).not.toBeNull();
      await db.exec(`UPDATE "Token" SET "deliveredAt" = NOW(), "deliveredByUserId" = 'u' WHERE id = 't'; DELETE FROM "Token" WHERE id = 't';`);
      await db.exec(`INSERT INTO "ReusableTokenRedemption" SELECT 'n' || i, 'u', 'deliver', now() FROM generate_series(1,50) i;`);
      balance = await db.query('SELECT "total" FROM "ActivityBalance" WHERE "userId" = $1', ['u']);
      awards = await db.query('SELECT "threshold", "points", "revokedAt" FROM "ActivityMilestoneAward" WHERE "userId" = $1 ORDER BY "threshold"', ['u']);
      expect(balance.rows[0].total).toBe(100);
      expect(awards.rows).toMatchObject([{ threshold: 50, points: 5, revokedAt: null }, { threshold: 100, points: 5, revokedAt: null }]);
      await db.exec(`UPDATE "ActivityMilestone" SET "points" = 8 WHERE "threshold" = 50; INSERT INTO "User" VALUES ('v'); INSERT INTO "ReusableTokenRedemption" SELECT 'v' || i, 'v', 'deliver', now() FROM generate_series(1,50) i;`);
      const prior = await db.query<{ points: number }>('SELECT "points" FROM "ActivityMilestoneAward" WHERE "userId" = $1 AND "threshold" = 50', ['u']);
      const newer = await db.query<{ points: number }>('SELECT "points" FROM "ActivityMilestoneAward" WHERE "userId" = $1 AND "threshold" = 50', ['v']);
      expect(prior.rows[0].points).toBe(5);
      expect(newer.rows[0].points).toBe(8);
    } finally { await db.close(); }
  }, 30000);
});
