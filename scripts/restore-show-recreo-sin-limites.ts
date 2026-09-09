import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  '16d49914-f18b-4b94-b61f-694094eb2f85', '2163b085-ed5a-44ca-a454-6418b3c25331', '205bf794-adc1-45ad-93cf-d13927aed5df', 'a3aaad4b-204f-4d29-8f0b-96619e60f089', 'd26e153e-d417-4e6d-a1b3-b719d3a07692', 'f609c69c-7de6-4723-b7fb-44aec05274b0',
  '2a020341-f62b-435e-92f2-77adc90e5ea9', 'b5223992-4ade-4081-aa95-60cfff81b27a', 'ac68b728-b18d-411a-bd1e-4fc9ae701b64', '8eaedd81-16b5-4c70-bfff-82d5135ce487', 'aff75ff8-bad9-405f-8f3c-7dfd78d473b0', '416bdddd-b9c0-4f63-b716-43427cdd9577',
  '0b051f2d-dd19-4003-b54a-f8654787dc86', '88a7b0e1-68af-4de7-b7dd-acb74f2a55b9', 'c4baceff-5da9-4bb4-b87b-b72ea29ed02e', 'ee7abc9d-6cb9-4273-ac69-e05a3e70599c', '6f087aa2-f674-4efa-8701-a5a0068a05e8', '3a700efd-d6f0-46b0-8314-03ffbc783092',
  '4a0f0499-7148-463c-82c2-a4d96498365f', '628e8dbb-79fd-47ec-944f-1fd2c802651c', 'e0afd502-49df-48de-ba62-294db6a8708d', 'f9624158-7a46-4c72-afbb-6dcfaf7abd49', '3644a865-9477-41d1-bd2c-26d309ff5f95', '0178cd49-9c58-4598-a654-ec027f75a4c2',
  '00c91654-5e16-4efb-94e3-468ef9b4fc53', '71ac9586-e6ec-403b-9d20-875e1825703f', '22775685-5d44-4a6b-8dab-72b364588368', 'a4948b2a-a2fe-4478-993e-5a4e6f7451c1', '807276f1-6ae5-4e28-9951-89ed52e37f65', '6aefc1b1-695a-4a00-a26d-5c087095b964',
];

const prizeSpecs = [
  { key: 'restored-show-rencorosas-1', label: 'Ron Barceló Imperial + Coca Cola 3L — S/219.90' },
  { key: 'restored-show-rencorosas-2', label: 'Absolut Sabores + Ginger Ale 3L — S/94.90' },
  { key: 'restored-show-rencorosas-3', label: 'Passport + Ginger Ale 3L — S/69.90' },
  { key: 'restored-show-rencorosas-4', label: 'Especies Andinas — Jarrita de Casa — S/15.90' },
  { key: 'restored-show-rencorosas-5', label: 'Margarita Corona — Copa — S/12.90' },
];

const description = '08.09.2026 // SHOW RECREO SIN LÍMITES';
const validFrom = DateTime.fromISO('2026-09-08', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-09T10:00', { zone: 'America/Lima' }).toJSDate();
const spinWindowStart = DateTime.fromISO('2026-09-08T20:00', { zone: 'America/Lima' });
const spinWindowEnd = DateTime.fromISO('2026-09-09T02:30', { zone: 'America/Lima' });

function randomSample<T>(values: T[], count: number): T[] {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

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

      const selectedIds = new Set(randomSample(tokenIds, 16));
      const selectedAt = tokenIds.filter((id) => selectedIds.has(id)).map((id, index) => {
        const span = spinWindowEnd.toMillis() - spinWindowStart.toMillis();
        return { id, order: index + 1, createdAt: new Date(spinWindowStart.toMillis() + Math.floor((span * (index + 1)) / 17)) };
      });

      for (const selected of selectedAt) {
        const token = await tx.token.findUnique({ where: { id: selected.id }, select: { id: true, prizeId: true, revealedAt: true, deliveredAt: true, redeemedAt: true } });
        if (!token) throw new Error(`Token no encontrado: ${selected.id}`);
        if (!token.revealedAt) {
          await tx.token.update({ where: { id: selected.id }, data: { revealedAt: selected.createdAt, assignedPrizeId: token.prizeId, deliveredAt: null, redeemedAt: null } });
        }
      }

      let session = await tx.rouletteSession.findFirst({ where: { batchId: batch.id }, orderBy: { createdAt: 'asc' } });
      if (!session) {
        session = await tx.rouletteSession.create({ data: { batchId: batch.id, mode: 'BY_PRIZE', status: 'FINISHED', spins: 16, maxSpins: 30, createdAt: spinWindowStart.toJSDate(), finishedAt: selectedAt.at(-1)?.createdAt ?? spinWindowEnd.toJSDate(), meta: JSON.stringify({ restored: true, randomSelection: true, totalSpins: 16, note: 'Reconstrucción histórica aproximada autorizada' }) } });
      }

      const existingSpins = await tx.rouletteSpin.count({ where: { sessionId: session.id } });
      if (existingSpins === 0) {
        const selectedTokens = await tx.token.findMany({ where: { id: { in: selectedAt.map((item) => item.id) } }, select: { id: true, prizeId: true } });
        const prizeByToken = new Map(selectedTokens.map((token) => [token.id, token.prizeId]));
        await tx.rouletteSpin.createMany({ data: selectedAt.map((item) => ({ sessionId: session!.id, prizeId: prizeByToken.get(item.id)!, tokenId: item.id, weightSnapshot: 1, order: item.order, createdAt: item.createdAt })) });
      }

      for (const prize of prizes) {
        const count = await tx.token.count({ where: { prizeId: prize.id, batchId: batch!.id } });
        await tx.prize.update({ where: { id: prize.id }, data: { stock: 0, emittedTotal: count, lastEmittedAt: now } });
      }

      return { batchId: batch.id, created: rows.length, skipped: existing.length, sessionId: session.id, selectedSpinTokens: selectedAt.map((item) => item.id), spinCount: selectedAt.length, prizeIds: prizes.map((prize) => prize.id) };
    }, { timeout: 60_000 });

    const [batch, tokens, spins] = await Promise.all([
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, functionalDate: true, isReusable: true, staticTargetUrl: true, _count: { select: { tokens: true, rouletteSessions: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true, revealedAt: true, deliveredAt: true, redeemedAt: true, signatureVersion: true } }),
      prisma.rouletteSpin.findMany({ where: { sessionId: result.sessionId }, select: { id: true, tokenId: true, prizeId: true, order: true, createdAt: true }, orderBy: { order: 'asc' } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, revealed: tokens.filter((token) => token.revealedAt).length, delivered: tokens.filter((token) => token.deliveredAt).length, redeemed: tokens.filter((token) => token.redeemedAt).length, batch, spins }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
