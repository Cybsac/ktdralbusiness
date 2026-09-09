import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'faf3990b-bc8c-46de-b6f6-cb70cf2dbb07', '09cc0298-0058-4067-8163-721b077eaf7d', '4abd2245-5804-4793-aaf0-ce6efb5cb7c9', '0506e61c-1e7d-4814-8589-7d3a56815643', '499fe85b-6b4a-4ba4-a346-30fa2628744f', '767f8898-e29d-4fd1-a1be-1203766db45d',
  '051782b9-d159-4b4c-b271-8eda4f1ed198', 'eb74582a-8860-433d-a363-09538b3e5012', '8001bf9c-c1f7-49f2-8718-f0b663861fae', '34f2e4ca-13b7-4a17-9796-6f843d05da2d', '14316b39-200c-4be8-84e7-bcb6985ec2fa', '00a58991-b13f-4efc-a77d-6f3f27338330',
  'c3f884aa-b618-4923-876c-7f41ed5a449c', '3810bc34-ab0a-4465-aa6b-6d9dae4b8e07', '1a599380-87fc-456b-806a-b16092e3ffc5', 'e5402b03-f69c-4c76-b11f-eb56fa6bfdc1', 'e5103f3e-1ec3-45a9-b765-e28e6532209c', '2301fafc-48f6-4b70-8143-fb5481e14b8d',
  'd8917880-7224-4fcb-aabf-b37ee372840c', 'acd159fd-43c3-4a7e-99d9-08c6041fa4ae', '6b6f01ad-c128-4525-93d4-92143ac65723', '484a0d55-9271-466f-a413-8d3f5bc05535', '49507c95-4f98-4c1f-b434-517540f74a79', '74ed41e1-1a6b-4e1b-ad75-3200b3bd9232',
  '87b26229-9b40-4d5e-849f-4c6a19dd7062', 'a81cf3dc-639e-4374-abfd-a330c6aafcdd', '73185820-5e23-4d3e-990f-e17eebb0a01d', '462d7525-32f6-4a3e-a130-fd30c89d9c56', '71956410-c246-4b3a-a9a5-c134b98048bb', 'b7eae80a-4b9f-4fcb-9958-78f8d9bffd57',
];

const prizeSpecs = [
  { key: 'restored-show-rencorosas-1', label: 'Ron Barceló Imperial + Coca Cola 3L — S/219.90' },
  { key: 'restored-show-rencorosas-2', label: 'Absolut Sabores + Ginger Ale 3L — S/94.90' },
  { key: 'restored-show-rencorosas-3', label: 'Passport + Ginger Ale 3L — S/69.90' },
  { key: 'restored-show-rencorosas-4', label: 'Especies Andinas — Jarrita de Casa — S/15.90' },
  { key: 'restored-show-rencorosas-5', label: 'Margarita Corona — Copa — S/12.90' },
];

const description = '12.09.2026 // SHOW COYOTE vs KTDRAL';
const validFrom = DateTime.fromISO('2026-09-12', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-13T10:00', { zone: 'America/Lima' }).toJSDate();

async function main() {
  if (tokenIds.length !== 30 || new Set(tokenIds).size !== 30) throw new Error('Se esperaban 30 UUID únicos');
  const version = CURRENT_SIGNATURE_VERSION;
  const secret = SECRET_MAP[version];
  if (!secret) throw new Error(`No existe secreto para la versión ${version}`);

  const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 60_000 } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      let batch = await tx.batch.findFirst({ where: { description }, orderBy: { createdAt: 'asc' } });
      if (!batch) batch = await tx.batch.create({ data: { description, functionalDate: validFrom, staticTargetUrl: null, isReusable: false } });

      const prizes = [];
      for (const spec of prizeSpecs) {
        let prize = await tx.prize.findUnique({ where: { key: spec.key } });
        if (!prize) prize = await tx.prize.create({ data: { key: spec.key, label: spec.label, active: true, stock: 0, emittedTotal: 0 } });
        else if (prize.label !== spec.label) prize = await tx.prize.update({ where: { id: prize.id }, data: { label: spec.label } });
        prizes.push(prize);
      }

      const existing = await tx.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true } });
      const existingIds = new Set(existing.map((token) => token.id));
      const now = new Date();
      const rows = tokenIds.filter((id) => !existingIds.has(id)).map((id) => {
        const prize = prizes[Math.floor(tokenIds.indexOf(id) / 6)];
        return { id, prizeId: prize.id, batchId: batch!.id, expiresAt, validFrom, signature: signToken(secret, id, prize.id, expiresAt, version), signatureVersion: version, disabled: false, createdAt: now, ingestedAt: now };
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
