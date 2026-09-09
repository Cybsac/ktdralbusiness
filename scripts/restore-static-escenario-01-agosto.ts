import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });
const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'fdad7a93-e53d-4e9d-86b9-ace6baa405ce', '7ad6d69b-a48e-4848-b8f2-2aad6373a1c0', '1c4dbcea-fbef-4513-8880-7b159f26b06c',
  '731434a1-751c-4beb-baa5-b0a14ab8dbf4', '34384b6f-8689-4b82-95fc-6e1ee9f0a950', '18afd9c4-3f3f-4cf7-a65a-b365406ad498',
  'be969d58-03c9-446d-9e85-007ef3c6bd8d', 'b2608227-830c-4b42-8d72-0428a3fa44ee', '48bdb450-efee-451c-b325-de8927111214',
  '9c849c0b-d67f-411f-b23a-261b01fa4961', 'd85a1457-f021-4a5f-ab35-2b8a5e798ac2', 'd88600bd-24e1-4024-9318-ca05835ff4f4',
  '6797e0d6-6397-4f00-ba6f-895b542c5775', '9f87a042-15c4-401d-8c71-5b64e5864671', 'e4866961-70b5-4fef-92c0-646e4db4d535',
];

const prizeSpecs = [
  { key: 'restored-static-escenario-01-1', label: 'COPA CÓCTEL RED LINE — GRATIS' },
  { key: 'restored-static-escenario-01-2', label: 'NUEVA JARRA WHIKSKATE 1LT — GRATIS' },
  { key: 'restored-static-escenario-01-3', label: 'TORRE KTBOOM 3LT — S/14.90' },
  { key: 'restored-static-escenario-01-4', label: 'JARRA CHARAPITA 1LT — GRATIS' },
  { key: 'restored-static-escenario-01-5', label: 'COPA CUBA LIBRE — GRATIS' },
];

const description = 'ESCENARIO 01 AGOSTO';
const validFrom = DateTime.fromISO('2026-08-25', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-08-31T10:00', { zone: 'America/Lima' }).toJSDate();

async function main() {
  if (tokenIds.length !== 15 || new Set(tokenIds).size !== 15) throw new Error('Se esperaban 15 UUID únicos');
  const version = CURRENT_SIGNATURE_VERSION;
  const secret = SECRET_MAP[version];
  if (!secret) throw new Error(`No existe secreto para la versión ${version}`);
  const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 60_000 } });
  try {
    const result = await prisma.$transaction(async (tx) => {
      let batch = await tx.batch.findFirst({ where: { description }, orderBy: { createdAt: 'asc' } });
      if (!batch) {
        batch = await tx.batch.create({ data: { description, functionalDate: validFrom, staticTargetUrl: '', isReusable: false, actionType: 'prize' } });
      }
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
        const prize = prizes[Math.floor(tokenIds.indexOf(id) / 3)];
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
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, staticTargetUrl: true, actionType: true, functionalDate: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
