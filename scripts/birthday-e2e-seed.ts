#!/usr/bin/env tsx
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const prisma = new PrismaClient();

const TIME_SLOTS = ['20:00', '21:00', '22:00', '23:00', '00:00'];
const NAMES = [
  'Alqui Vip',
  'Tocame Las Nalgas',
  'Señor Escándalo',
  'Doctora Fiestón',
  'Comandante Neón',
  'Lady Chongo',
  'Doctor Descontrol',
  'Reina del Vacilón',
  'Mister Parranda',
  'La Jefa del Ruido',
  'Capitán Guaracha',
  'Princesa del Salseo',
];

const MARKER = 'E2E_BIRTHDAYS_SEED';

type SeededRow = {
  day: string;
  celebrantName: string;
  documento: string;
  phone: string;
  timeSlot: string;
  wantsPhotoSession: boolean;
  reservationId: string;
  tokenCode: string | null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string | boolean | number> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--days' && next) out.days = Number(next);
    else if (a === '--per-day' && next) out.perDay = Number(next);
    else if (a === '--min-per-day' && next) out.minPerDay = Number(next);
    else if (a === '--max-per-day' && next) out.maxPerDay = Number(next);
    else if (a === '--start-date' && next) out.startDate = next;
    else if (a === '--no-tokens') out.noTokens = true;
    else if (a === '--dry-run') out.dryRun = true;
  }

  return {
    days: Number.isFinite(Number(out.days)) ? Number(out.days) : 10,
    perDay: Number.isFinite(Number(out.perDay)) ? Number(out.perDay) : null,
    minPerDay: Number.isFinite(Number(out.minPerDay)) ? Number(out.minPerDay) : 1,
    maxPerDay: Number.isFinite(Number(out.maxPerDay)) ? Number(out.maxPerDay) : 3,
    startDate: typeof out.startDate === 'string' ? out.startDate : null,
    noTokens: Boolean(out.noTokens),
    dryRun: Boolean(out.dryRun),
  };
}

function pickCount(min: number, max: number, fixed: number | null) {
  if (fixed && fixed > 0) return fixed;
  const low = Math.max(1, Math.floor(min));
  const high = Math.max(low, Math.floor(max));
  return low + Math.floor(Math.random() * (high - low + 1));
}

function safePhone(base: number, seq: number) {
  return String(900000000 + base * 100 + seq).padStart(9, '0').slice(-9);
}

function safeDni(base: number, seq: number) {
  return String(70000000 + base * 100 + seq).padStart(8, '0').slice(-8);
}

function safeEmail(dni: string, day: string, seq: number) {
  return `e2e+bday+${dni}+${day.replace(/-/g, '')}+${seq}@example.test`;
}

async function main() {
  const args = parseArgs();
  const { createReservation, generateInviteTokens } = args.dryRun
    ? { createReservation: null, generateInviteTokens: null }
    : await import('../src/lib/birthdays/service');
  const start = (args.startDate
    ? DateTime.fromISO(args.startDate, { zone: 'America/Lima' })
    : DateTime.now().setZone('America/Lima')
  ).startOf('day');

  if (!start.isValid) {
    throw new Error(`START_DATE_INVALID: ${args.startDate}`);
  }

  const pack = await prisma.birthdayPack.findFirst({
    where: { active: true },
    orderBy: [
      { featured: 'desc' },
      { qrCount: 'desc' },
      { priceSoles: 'asc' },
      { name: 'asc' },
    ],
    select: { id: true, name: true, qrCount: true, featured: true, active: true, priceSoles: true },
  });

  if (!pack) {
    throw new Error('No se encontró ningún pack activo de cumpleaños.');
  }

  const baseSeed = Number(String(Date.now()).slice(-4));
  const rows: SeededRow[] = [];

  console.log('--- Birthday E2E seed ---');
  console.log({
    marker: MARKER,
    baseDate: start.toISODate(),
    days: args.days,
    perDay: args.perDay ?? `${args.minPerDay}-${args.maxPerDay}`,
    generateTokens: !args.noTokens,
    pack: { id: pack.id, name: pack.name, qrCount: pack.qrCount, featured: pack.featured, priceSoles: pack.priceSoles },
  });

  if (args.dryRun) {
    console.log('[dry-run] No se crearán registros.');
    return;
  }

  for (let dayIndex = 0; dayIndex < args.days; dayIndex++) {
    const day = start.plus({ days: dayIndex }).startOf('day');
    const count = pickCount(args.minPerDay, args.maxPerDay, args.perDay);

    for (let seqInDay = 0; seqInDay < count; seqInDay++) {
      const globalSeq = rows.length;
      const dayLabel = day.toISODate() ?? '';
      const celebrantName = NAMES[globalSeq % NAMES.length];
      const documento = safeDni(baseSeed, globalSeq);
      const phone = safePhone(baseSeed, globalSeq);
      const email = safeEmail(documento, dayLabel, seqInDay);
      const timeSlot = TIME_SLOTS[(dayIndex + seqInDay) % TIME_SLOTS.length];
      const wantsPhotoSession = (globalSeq + dayIndex + seqInDay) % 2 === 0;

      const reservation = await createReservation({
        celebrantName,
        phone,
        documento,
        email,
        date: day.toJSDate(),
        timeSlot,
        packId: pack.id,
        guestsPlanned: Math.min(Math.max(pack.qrCount || 1, 1), 200),
        wantsPhotoSession,
        createdBy: MARKER,
        isAdmin: true,
      });

      const tokens = args.noTokens ? [] : await generateInviteTokens(reservation.id, { force: true }, MARKER);

      rows.push({
        day: dayLabel,
        celebrantName,
        documento,
        phone,
        timeSlot,
        wantsPhotoSession,
        reservationId: reservation.id,
        tokenCode: tokens[0]?.code ?? null,
      });
    }
  }

  console.log(`\nCreadas ${rows.length} reservas de prueba.`);
  console.table(rows);
}

main()
  .catch((err) => {
    console.error('birthday-e2e-seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
