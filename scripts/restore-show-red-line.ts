import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });
const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'c4d63935-e08a-423b-bb8f-6f391a04d25c', 'aeda9036-1fa2-4f8c-8439-25650a5de3e8', '6ddffa0f-9d70-42d2-950c-3a96eafddda8', '61ec2614-bc7f-4888-81ae-974c2afa8d47', '776b00a9-3703-4bb8-98ca-bcd50d81812a', '4915533c-50f6-4db5-88fc-5a472f8fd65a', 'b681c359-4b87-47a2-aae2-690a46833f98', 'a4e8df6f-ba41-420e-a72c-dd076fe09d52',
  '87fc5943-4c5d-4d1a-9bcc-6ecdefcf621a', '142a6ecb-a8cb-4f0e-8649-bfe06899fe31', '7924f39b-7bc5-499e-9dd0-bce92ba99d40', '8b86a45f-0ba1-4f19-ba9b-14022f6474e2', '678db7be-f25c-4ee7-9b30-36b06d6d7af0', 'ffbe1ed9-7990-4d42-a5f1-25da7add676d', '4cf2c702-b5d7-4fad-853a-59e082ec8ce2', '42607171-3652-461e-a275-946dab3a7523',
  '0bf87907-740b-4d14-8ac3-d1af9109fa25', '8443a479-88f6-4dba-a13f-ebc3aac2374a', 'c13979f2-fee5-4726-9735-300d11dc3565', '60bdb7fa-5bb7-4c28-a413-f915be767323', '080c0220-6b23-46c6-b2a2-c7d4b5115154', '785a8efb-9d3f-4d14-8b04-f4777b730a67', 'bd6ca16a-7b76-443f-8ffb-1b70ec749f82', '66e639f0-cc08-4aaa-bafa-1ed4792534fa',
  '87968165-6a2a-4a2d-acfa-5fbb95768e47', '4b02ca5d-ce4b-455a-83d4-fbc666106e78', '557b2779-8991-4382-9e66-d915a7bd73fc', '8794565e-cc2b-4e78-9a80-38f26cdf1d0a', '1e01a5bb-fe4c-463f-8406-e1734f573017', '5e784355-7ef5-4384-a294-d939fb3998d9',
];

const prizeSpecs = [
  { key: 'restored-show-mala-costumbre-1', label: 'Hendrick’s + Ginger Ale 3L — S/199.90' },
  { key: 'restored-show-mala-costumbre-2', label: 'Jägermeister + 2 Red Bull — S/129.90' },
  { key: 'restored-show-mala-costumbre-3', label: 'Smirnoff + Ginger Ale 3L — S/99.90' },
  { key: 'restored-show-mala-costumbre-4', label: 'Mora Azul + Minero (2 Jarritas de Casa) — S/34.90' },
  { key: 'restored-show-mala-costumbre-5', label: 'Piña Colada (copa) — S/9.90' },
];

const description = '28.08.2026 // SHOW RED LINE';
const validFrom = DateTime.fromISO('2026-08-28', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-08-29T10:00', { zone: 'America/Lima' }).toJSDate();

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
