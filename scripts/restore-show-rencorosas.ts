import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  '03452756-e951-4d08-b77b-63dbe22c9657', 'f762d48f-324a-4846-8c67-550788b56811', '44215453-5ce4-4d8c-8506-07c1541d745a', '142e79f0-0c5a-4a4c-8bd5-0d0eb79f4dbf', 'e6d77198-2f13-4d63-8469-f960e2c732d9', '2358965f-3fa2-48e0-a6d9-2c473cb17719',
  'a3c43508-3e6e-4eb0-879b-355180b6a727', '982c3730-2422-4e0d-805c-ab973d666f8e', '5dbcf739-aebc-46db-961a-1e53902dee1f', 'ebf5aebb-88b6-472d-9367-017f2457cb2d', 'e9270cad-de32-4572-b220-10c43aa2b46d', 'a17f33a1-4927-42ad-816e-f3d6a34da8a3',
  'c4657209-4dc5-441d-bb58-a0194938b284', 'b3979621-6daa-4b58-ad22-1400c3921943', '347856cb-769b-49f1-a188-1e11f418a0ff', '59fadce7-945a-4f1f-a3cc-1b0328fb468e', '492642be-30f8-4659-9370-37166761d2e0', 'ba0cd84a-33a3-45f3-a895-853eb942b88d',
  '9c72fd79-5f3e-45d7-adcc-73ad2c6984f5', '96f0f2fb-fb86-4404-80fc-4e3c6a76d770', '0da58e2a-799f-4a24-a330-b14b81b7e02a', 'c249fea5-937a-42cd-b388-68e756b03fb0', '6bb8b82b-e3df-4ddf-b2db-5470d1027e52', 'e7586c2b-3f81-471b-a2c1-0c45cb20000f',
  'fd54b7e6-0e11-4838-a4a5-88b16ff58c28', '54fd0be6-eb2b-45d8-b379-f62e36e136b7', 'a191cac5-c40a-4c4c-83b9-d1d27dcb3031', '885153e4-76fe-4f74-9997-989aa79a0a22', 'b1b9b3de-0446-4214-80dc-ad14563e0bad', '4eda8645-3ca4-40c0-84e8-0141f75fd206',
];

const prizeSpecs = [
  { key: 'restored-show-rencorosas-1', label: 'Ron Barceló Imperial + Coca Cola 3L — S/219.90' },
  { key: 'restored-show-rencorosas-2', label: 'Absolut Sabores + Ginger Ale 3L — S/94.90' },
  { key: 'restored-show-rencorosas-3', label: 'Passport + Ginger Ale 3L — S/69.90' },
  { key: 'restored-show-rencorosas-4', label: 'Especies Andinas — Jarrita de Casa — S/15.90' },
  { key: 'restored-show-rencorosas-5', label: 'Margarita Corona — Copa — S/12.90' },
];

const description = '09.09.2026 // SHOW RENCOROSAS';
const validFrom = DateTime.fromISO('2026-09-09', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-10T10:00', { zone: 'America/Lima' }).toJSDate();

async function main() {
  if (tokenIds.length !== 30 || new Set(tokenIds).size !== 30) throw new Error('Se esperaban 30 UUID únicos');
  const version = CURRENT_SIGNATURE_VERSION;
  const secret = SECRET_MAP[version];
  if (!secret) throw new Error(`No existe secreto para la versión ${version}`);

  const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 60_000 } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      let batch = await tx.batch.findFirst({ where: { description }, orderBy: { createdAt: 'asc' } });
      if (!batch) {
        batch = await tx.batch.create({ data: { description, functionalDate: validFrom, staticTargetUrl: null, isReusable: false } });
      }

      const prizes = [];
      for (const spec of prizeSpecs) {
        let prize = await tx.prize.findUnique({ where: { key: spec.key } });
        if (!prize) {
          prize = await tx.prize.create({ data: { key: spec.key, label: spec.label, active: true, stock: 0, emittedTotal: 0 } });
        } else if (prize.label !== spec.label) {
          prize = await tx.prize.update({ where: { id: prize.id }, data: { label: spec.label } });
        }
        prizes.push(prize);
      }

      const existing = await tx.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true } });
      const existingIds = new Set(existing.map((token) => token.id));
      const now = new Date();
      const rows = tokenIds.filter((id) => !existingIds.has(id)).map((id) => {
        const prize = prizes[Math.floor(tokenIds.indexOf(id) / 6)];
        return {
          id,
          prizeId: prize.id,
          batchId: batch!.id,
          expiresAt,
          validFrom,
          signature: signToken(secret, id, prize.id, expiresAt, version),
          signatureVersion: version,
          disabled: false,
          createdAt: now,
          ingestedAt: now,
        };
      });
      if (rows.length) await tx.token.createMany({ data: rows, skipDuplicates: true });

      for (const prize of prizes) {
        const count = await tx.token.count({ where: { prizeId: prize.id, batchId: batch!.id } });
        await tx.prize.update({ where: { id: prize.id }, data: { stock: 0, emittedTotal: count, lastEmittedAt: now } });
      }

      return { batchId: batch.id, created: rows.length, skipped: existing.length, prizeIds: prizes.map((prize) => prize.id) };
    }, { timeout: 60_000 });

    const [batch, tokens, prizes] = await Promise.all([
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, functionalDate: true, isReusable: true, staticTargetUrl: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true, signatureVersion: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
