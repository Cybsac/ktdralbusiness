import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });
const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'a040a197-a171-40f6-8d05-662fdbb1f49d', '6d0b458e-1369-41dd-8b5b-7f706ad85c96', 'dad01de7-cac5-481d-8fd1-96b8274aa0b5', 'adaba724-ebe8-47ad-bfb0-ea59fee104f0', 'f871112b-9029-438d-a476-8249e5a9250b', 'ec2ff104-7d47-4459-88e1-3d608773e13c', '3910d545-ec8a-4baf-87b9-d2ec6cc2a414', '8c21d9bb-a5a1-4754-8065-317e31e7d565',
  'c4c4e548-999e-4f67-95b5-58393bde301f', '38bb5063-9983-4358-a230-5ebe7fca1b77', '86ac2bd6-8c4d-4b70-8ca4-f243c5d57e76', 'bb915660-3c50-4355-84cf-cf9b780d411c', '0d797d9e-1c2f-433e-97f4-4c57b5c92fb3', '3c31b2dd-53b1-4644-b50e-316344854c92', '5e4eb13f-e1c6-4304-8131-d4409f709f26', 'cdb68ba0-37f1-4029-86e3-745383a96972',
  '03bcfee9-6dc8-4635-b82e-f4443c713b9c', 'ae701f60-995e-4e61-8811-b5039b35acc7', 'd345186d-5a5d-4625-8ec6-9bcf33ddae85', '0b08b83e-7965-46f4-b95f-0397842963ed', 'af0ba8c4-b64e-452d-b7db-a8fa2fb0f66a', '00175708-2e9e-45ec-8922-fbf79d300767', 'd244845a-8921-45d0-8d0c-ec4babcb392f', 'bd6267c3-b051-4e1c-a30f-3936dda1de32',
  '4b2dce88-d63c-4edf-a7c4-42fa0e6d6d73', '6b55abbe-aec3-4be3-9dd1-59837596a4b2', '665c77ff-7b98-4e14-b836-6a3397a908a7', '3e55e03c-357a-4847-ba58-3d91ae104734', '53579ad3-7d40-4dce-915b-e9d6be932446', '3da67aa5-9fe2-4c4b-b2e4-c1d708d99cf0',
];

const prizeSpecs = [
  { key: 'restored-show-mala-costumbre-1', label: 'Hendrick’s + Ginger Ale 3L — S/199.90' },
  { key: 'restored-show-mala-costumbre-2', label: 'Jägermeister + 2 Red Bull — S/129.90' },
  { key: 'restored-show-mala-costumbre-3', label: 'Smirnoff + Ginger Ale 3L — S/99.90' },
  { key: 'restored-show-mala-costumbre-4', label: 'Mora Azul + Minero (2 Jarritas de Casa) — S/34.90' },
  { key: 'restored-show-mala-costumbre-5', label: 'Piña Colada (copa) — S/9.90' },
];

const description = '29.08.2026 // SHOW SIRENAS Y PERREO';
const validFrom = DateTime.fromISO('2026-08-29', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-08-30T10:00', { zone: 'America/Lima' }).toJSDate();

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
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, staticTargetUrl: true, functionalDate: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
