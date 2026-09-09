import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  '0a636f92-21e7-49d9-9cd1-5ebc38ebe6d1',
  '4a06fda0-73fa-446e-84bc-d11a343e36e2',
  'e5a62315-4018-4795-989e-ef6d1074c73a',
  '5be80de9-47e4-41e9-b21b-3b1c68481709',
  'd2acc158-efc9-43f2-9d54-7f1487d92468',
  'de1d82d2-7ab7-405d-b599-1cba97a92b0d',
  '30d0de6f-5665-4661-a602-88c5173ee2ed',
  'a777db5e-0a7a-4128-8567-fe1978264f3c',
  '824e9595-a2af-4e16-9223-66c1b1b0313f',
  'b58431b2-780f-4d33-abd5-7ed38b02ba24',
  '96020e6a-a6f8-415d-8351-9c167350adc0',
  '6d2c9521-f491-4070-b559-3acd7514e295',
  'f2bcc9f3-3339-4f36-a504-2396b2ca3144',
  'c8bc9a53-1842-494f-8287-101f31d564f2',
  '4945162d-70cd-49c3-852e-b48c1811ad06',
];

const prizeSpecs = [
  { key: 'restored-static-escenario-001-1', label: 'NUEVA JARRA WHIKSKATE 1LT — GRATIS' },
  { key: 'restored-static-escenario-001-2', label: 'JARRA CHARAPITA 1LT — GRATIS' },
  { key: 'restored-static-escenario-001-3', label: 'COPA CUBA LIBRE — GRATIS' },
];

const description = 'ESCENARIO 001';
const timezone = 'America/Lima';
const validFrom = DateTime.fromISO('2026-09-08', { zone: timezone }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-13T10:00', { zone: timezone }).toJSDate();

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
        batch = await tx.batch.create({
          data: { description, functionalDate: validFrom, staticTargetUrl: '', isReusable: false, actionType: 'prize' },
        });
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
      const rows = tokenIds.filter((id) => !existingIds.has(id)).map((id, index) => {
        const prize = prizes[Math.floor(index / 5)];
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
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, functionalDate: true, staticTargetUrl: true, actionType: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);

    const byPrize = new Map<string, number>();
    for (const token of tokens) byPrize.set(token.prizeId, (byPrize.get(token.prizeId) ?? 0) + 1);
    if (tokens.length !== 15 || batch?.staticTargetUrl === null || batch?.staticTargetUrl === undefined || tokens.some((token) => token.batchId !== result.batchId || token.disabled)) {
      throw new Error('La verificación del lote estático no coincide con lo esperado');
    }
    if (prizes.some((prize) => byPrize.get(prize.id) !== 5)) throw new Error('Cada premio debe tener exactamente 5 tokens');

    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, tokensPerPrize: Object.fromEntries(byPrize), batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
