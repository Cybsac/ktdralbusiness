import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });
const { CURRENT_SIGNATURE_VERSION, SECRET_MAP, signToken } = require('../src/lib/signing') as typeof import('../src/lib/signing');

const tokenIds = [
  'db4178bc-6eab-44ce-99da-70a3a1d5066d', 'b4134313-9829-48a1-9c2a-e355aa1c4bde', 'cbf01036-9edf-48cd-b991-e4ff3f2d9e00', '68188546-335a-4dfb-9255-2e9128fee0c8', '3462cd6c-c9ac-4bd4-a88f-a8e7323e5388', '5df64a5a-a9e6-4854-a129-9a33adc33758', '8c48089e-9ccf-4c8e-affd-c443c2a4030f', '9766cff3-2bde-4280-ae52-3a623f95019d',
  '2cb5b771-fd0d-4f1f-969b-e4396d636f05', '17d5152f-79c2-4fec-ba71-e74645fcbd88', '90e948cd-69a0-45ba-ae21-c5e9868177cb', 'd9229146-299d-43f6-ad13-ad0b3c9046a4', '605c751f-8a00-4028-9b74-e2b24519a34c', 'd6a17c91-ef66-4f22-9603-3cdfa5a0d21a', '3460260c-cc98-4199-ba84-32c7ef5bacad', 'e1b26764-429d-4ba6-9d27-d1a2e093b234',
  '43cd9957-0211-4c68-90ee-d8e30f449a7a', 'ad7a1145-587f-44b8-b96b-c64ac1c04858', '65db5d36-cbc2-417f-b9ac-f0c91b4fac18', 'c77b483c-eacd-4a89-8a24-2782090c5687', 'b24bf5d1-15c2-4457-8f12-18b081f6c46b', '5a1231f1-c596-4314-b333-035265663371', 'b3008ce5-b966-4586-ac89-2ceb61f6b477', '2ddb7515-85c6-433d-9be9-ff48b0cc2c4c',
  'a9221d1d-dcb8-40c7-a1a2-b8dca8e6efa2', '3f73fd31-22f1-4888-84a4-a58852973f1e', '405faca9-1f0b-4804-a1dd-13c932839a24', 'fee0bcd5-2bed-4eaa-bf57-50c9b51f8119', '19301476-564b-4c1a-91eb-ac3a23375a0e', 'cb28e359-5284-4a12-bb53-0cdc307c8b06',
];

const prizeSpecs = [
  { key: 'restored-show-mala-costumbre-1', label: 'Hendrick’s + Ginger Ale 3L — S/199.90' },
  { key: 'restored-show-mala-costumbre-2', label: 'Jägermeister + 2 Red Bull — S/129.90' },
  { key: 'restored-show-mala-costumbre-3', label: 'Smirnoff + Ginger Ale 3L — S/99.90' },
  { key: 'restored-show-mala-costumbre-4', label: 'Mora Azul + Minero (2 Jarritas de Casa) — S/34.90' },
  { key: 'restored-show-mala-costumbre-5', label: 'Piña Colada (copa) — S/9.90' },
];

const description = '27.08.2026 // SHOW JUEBES';
const validFrom = DateTime.fromISO('2026-08-27', { zone: 'America/Lima' }).startOf('day').toJSDate();
const expiresAt = DateTime.fromISO('2026-08-28T10:00', { zone: 'America/Lima' }).toJSDate();

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
      prisma.batch.findUnique({ where: { id: result.batchId }, select: { id: true, description: true, staticTargetUrl: true, functionalDate: true, _count: { select: { tokens: true } } } }),
      prisma.token.findMany({ where: { id: { in: tokenIds } }, select: { id: true, prizeId: true, batchId: true, expiresAt: true, validFrom: true, disabled: true } }),
      prisma.prize.findMany({ where: { id: { in: result.prizeIds } }, select: { id: true, key: true, label: true, active: true, stock: true, emittedTotal: true } }),
    ]);
    console.log(JSON.stringify({ ok: true, ...result, verifiedTokens: tokens.length, batch, prizes, validFrom, expiresAt, signatureVersion: version }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
