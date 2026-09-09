import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'b6ac64f6-57b1-4b57-8915-527074942e47', '21d91940-c506-4b3a-bced-51941a949033', 'c5d03300-4bd5-401c-8444-14504cfb549f', '3a110220-ce8d-4752-a372-833fdf10b05a', 'd2ece6ad-454e-4d76-82cb-3084d8ea21a2', '60172718-a23c-48cc-9b75-a02e8e19bd97',
  'a0885cfc-1aa8-492e-b720-e83a9f668c9a', '8b3b179e-6a04-4b92-bed8-aa5b9186043f', '00cc94d3-8d17-4543-983e-3261a655d5aa', 'dcc4acc7-ce39-4831-9c53-acd8ce3f09e8', '2f45a5b6-b65e-4268-af72-e513140864b8', '673067fd-a591-4ed6-813c-1d6b84a0a0ad',
  'd5288851-f357-4cde-beb7-3ba6a9a22d9c', '05b72da4-3c94-4b75-a60c-7e0bf4f6e933', '70d6de0a-8ab2-4286-8ef1-993fe2c5d4fa', 'dd968b14-8b9d-4879-9b40-cef7a8c7f812', 'fd83aefc-d5a4-46a4-8d22-c9f385fc46ca', '3d309dcc-395a-4010-b326-955c47f24d7b',
  '081c272c-e150-4cd7-96c2-8c5181a9f168', '349408d5-5d6f-41e9-85e4-f89ba6a5425f', '0921c8a0-fbfb-42bb-bbee-0aac86a69da0', '1a2e1494-a2c2-464b-a636-fe30ff97d5e9', '6d0288b5-f04f-4adf-97a9-00855cf1f767', '8e1b3d00-9454-4377-80e1-c805326935ae',
  'e4993bc0-12c8-42f6-a6b1-35251e5abb2b', '240cde79-b208-44a2-8307-67fa85e96f00', '326b7728-cbe6-4dbc-9347-1cf63510adbb', '9df09989-b31d-48df-8724-7ccbe9042cc9', '2b02fe16-d122-4b0f-86a7-53c805ee6908', 'cfb85a99-51d8-4c6f-aa34-64055a420ec6',
];

const prizeSpecs = [
  { key: 'restored-show-rencorosas-1', label: 'Ron Barceló Imperial + Coca Cola 3L — S/219.90' },
  { key: 'restored-show-rencorosas-2', label: 'Absolut Sabores + Ginger Ale 3L — S/94.90' },
  { key: 'restored-show-rencorosas-3', label: 'Passport + Ginger Ale 3L — S/69.90' },
  { key: 'restored-show-rencorosas-4', label: 'Especies Andinas — Jarrita de Casa — S/15.90' },
  { key: 'restored-show-rencorosas-5', label: 'Margarita Corona — Copa — S/12.90' },
];

const description = '11.09.2026 // SHOW RED LINE - DÍA DEL CONTADOR';
const validFrom = DateTime.fromISO('2026-09-11', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-09-12T10:00', { zone: 'America/Lima' }).toJSDate();

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
