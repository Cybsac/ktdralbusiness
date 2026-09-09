import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  '851eb214-659b-4050-96e0-3dd7e005d49d', 'aec556a8-139f-4be3-8350-c8ff3993581a', 'ed92570c-ae46-49bb-92f9-01a6fb519ba8', '33c09130-0fca-40ef-96a6-c057f8bd0234', 'a29f1a24-0bd0-4c57-9e4c-f611c469b499', '09d7c9eb-43f5-49d2-a7b6-57e93dafc81d',
  '6541fd83-cf4b-442e-a077-452714570020', 'a6ba026b-ae5c-487d-8ba7-c76c857f1ad3', '18a8690b-e778-4387-b33b-ba7d1c6d964b', '36f41a7e-5080-4d16-8996-2da44d0dc617', 'f9614450-f6e6-4dac-9c72-fc0575de1850', '2c963aac-f9b7-44f0-b0ec-b6602fc25376',
  'e11315ad-d3e4-4194-90ef-94f48792e4d5', '7e06df9b-8fdf-4a66-9943-6d2606b91bbf', '61099c78-8fc3-46e4-8c00-c85235d668ec', '45cf5c44-4f90-4a35-8282-a97be5f80a9a', 'ddf44942-3a5d-46c3-a2f7-1a63e46c19e1', '460e44a2-8f01-4e40-8f61-2ba8bf829dd0',
  'd5020615-ad9a-404e-acd3-3b650c1e756c', '8ba04bd0-bbc5-4ef0-aa2b-0475e8c1699c', '8d60898e-2d71-4d57-b09a-92614980650f', 'a132563e-9029-4ad3-a654-c086666969e3', 'cf5c9f10-8bc2-44ba-a5ac-758d0cb03487', 'f5c5cc37-c27e-42bb-921e-28643a3e28e9',
  '05539063-dbf2-4477-a58d-1864f7142f0b', '005ff54b-6b1e-4eb4-b62d-fdcf53cc5d7c', '827cfd5e-6ccf-4834-bfad-5c335cef6bb1', '4633bc86-45d1-40e1-a26a-65dc0e7bf8c0', '982985cc-4716-41d0-8e3a-0c2d9ba1fa03', '7698e5bb-aca3-4fe5-ac89-767bea1f4346',
];

const prizeSpecs = [
  { key: 'restored-show-rencorosas-1', label: 'Ron Barceló Imperial + Coca Cola 3L — S/219.90' },
  { key: 'restored-show-rencorosas-2', label: 'Absolut Sabores + Ginger Ale 3L — S/94.90' },
  { key: 'restored-show-rencorosas-3', label: 'Passport + Ginger Ale 3L — S/69.90' },
  { key: 'restored-show-rencorosas-4', label: 'Especies Andinas — Jarrita de Casa — S/15.90' },
  { key: 'restored-show-rencorosas-5', label: 'Margarita Corona — Copa — S/12.90' },
];

const description = '10.09.2026 // SHOW JUEBES - HAWAIAN PARTY';
const validFrom = DateTime.fromISO('2026-09-10', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-11T10:00', { zone: 'America/Lima' }).toJSDate();

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
