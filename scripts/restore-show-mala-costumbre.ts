import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

// Load signing only after dotenv so the real Railway secret is available.
const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  '857c45ed-5cda-4c6e-ad48-91dab16674f1',
  '61cf7cb0-0161-4b11-b0fb-85cec4e971f9',
  'b9d99cd3-db22-415e-9d50-a67ca449ebdf',
  '75ab1c2c-6310-4771-93de-da9452ec62a7',
  'ef8d11f8-3a10-4e2e-b949-06eedd58fe15',
  '4ae611b6-c789-4c82-aaf8-e94f76582b2b',
  '96eb41c8-74c0-451d-922c-611a2c2d2ed8',
  '6b3798cc-bff4-4360-b5bf-f21bfc212757',
  '6656d9c2-18a7-4c32-9266-b3fa24fdb515',
  '7c6af7d8-db24-4d61-83af-65a9cdbdf062',
  '982846f7-02df-4640-af6e-88a6023ac281',
  '6c608a3c-34ba-4bb1-a552-797a69f8161f',
  '26ec21c1-496a-4887-a2db-e60ebd2f0f93',
  '86355f84-8a46-401e-9744-49a631f81ba2',
  '953afb29-7ac4-4e3d-b739-f4bdce053f1d',
  'c3053a5a-5bde-4a47-a742-f4ca839ab3af',
  '1dcf33fb-b96b-4354-8a30-9dbe43a0c0e1',
  'ad7798de-24d4-4608-a285-0f70d4412841',
  'c1228d56-02a9-4a9f-a95c-c7761cfc0a3c',
  '4969745f-cc83-416c-ae87-bf8da793ad8a',
  '2d081c84-7119-419e-bb10-1765f3a5a823',
  '2cdb1ff0-590f-40c0-a7d6-ece7b3baebd8',
  'a1d8ffd4-0d77-4375-9bea-abf605c5219d',
  'a28d26a2-3cda-41d7-ab0d-6b86582b23f7',
  '99f80cf5-804d-452b-b255-eec4dd024872',
  '77d80ee3-4a3f-4262-af55-0858733e8d1e',
  '21f43b5e-a5a8-4fc5-9b70-d8569cd6c166',
  'ebeb2dc3-d9d9-42da-bd0f-6c28e7252736',
  'bdb4eea3-7dba-40b8-9268-f86c037e3eba',
  '51a17b7f-ef6c-4827-87fc-42a8dbf4a207',
];

const prizeSpecs = [
  { key: 'restored-show-mala-costumbre-1', label: 'Hendrick’s + Ginger Ale 3L — S/199.90' },
  { key: 'restored-show-mala-costumbre-2', label: 'Jägermeister + 2 Red Bull — S/129.90' },
  { key: 'restored-show-mala-costumbre-3', label: 'Smirnoff + Ginger Ale 3L — S/99.90' },
  { key: 'restored-show-mala-costumbre-4', label: 'Mora Azul + Minero (2 Jarritas de Casa) — S/34.90' },
  { key: 'restored-show-mala-costumbre-5', label: 'Piña Colada (copa) — S/9.90' },
];

const description = '26.08.2026 // SHOW MALA COSTUMBRE';
const validFrom = DateTime.fromISO('2026-08-26', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-08-27T10:00', { zone: 'America/Lima' }).toJSDate();

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
        batch = await tx.batch.create({
          data: { description, functionalDate: validFrom, staticTargetUrl: null, isReusable: false },
        });
      }

      const prizes = [];
      for (const spec of prizeSpecs) {
        let prize = await tx.prize.findUnique({ where: { key: spec.key } });
        if (!prize) {
          prize = await tx.prize.create({
            data: { key: spec.key, label: spec.label, active: true, stock: 0, emittedTotal: 0 },
          });
        } else if (prize.label !== spec.label) {
          prize = await tx.prize.update({ where: { id: prize.id }, data: { label: spec.label } });
        }
        prizes.push(prize);
      }

      const existing = await tx.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true } });
      const existingIds = new Set(existing.map((token) => token.id));
      const now = new Date();
      const missing = tokenIds.filter((id) => !existingIds.has(id));
      const rows = missing.map((id) => {
        const originalIndex = tokenIds.indexOf(id);
        const prize = prizes[Math.floor(originalIndex / 6)];
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
    });

    const [batch, tokens, prizes] = await Promise.all([
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, staticTargetUrl: true, functionalDate: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true, signature: true, signatureVersion: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
