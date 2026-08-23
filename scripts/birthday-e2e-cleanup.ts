#!/usr/bin/env tsx
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const DEFAULT_MARKER = 'E2E_BIRTHDAYS_SEED';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--created-by' && next) out.createdBy = next;
    else if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.dryRun = true;
  }

  return {
    createdBy: typeof out.createdBy === 'string' ? out.createdBy : DEFAULT_MARKER,
    dryRun: out.dryRun === true ? true : out.apply === true ? false : true,
  };
}

async function main() {
  const args = parseArgs();

  const reservations = await prisma.birthdayReservation.findMany({
    where: { createdBy: args.createdBy },
    select: { id: true, celebrantName: true, date: true },
    orderBy: { createdAt: 'asc' },
  });

  const reservationIds = reservations.map((r) => r.id);
  const tokens = reservationIds.length
    ? await prisma.inviteToken.findMany({
        where: { reservationId: { in: reservationIds } },
        select: { id: true, reservationId: true, code: true },
      })
    : [];
  const tokenIds = tokens.map((t) => t.id);

  const courtesyCount = reservationIds.length
    ? await prisma.courtesyItem.count({ where: { reservationId: { in: reservationIds } } })
    : 0;
  const photoCount = reservationIds.length
    ? await prisma.photoDeliverable.count({ where: { reservationId: { in: reservationIds } } })
    : 0;
  const redemptionCount = reservationIds.length
    ? await prisma.tokenRedemption.count({ where: { OR: [{ reservationId: { in: reservationIds } }, { tokenId: { in: tokenIds } }] } })
    : 0;
  const cardCount = tokenIds.length
    ? await prisma.inviteTokenCard.count({ where: { inviteTokenId: { in: tokenIds } } })
    : 0;
  const auditCount = await prisma.eventLog.count({
    where: {
      type: { startsWith: 'birthday.' },
      message: { contains: args.createdBy },
    },
  });

  console.log('--- Birthday E2E cleanup ---');
  console.log({
    marker: args.createdBy,
    reservations: reservations.length,
    tokens: tokens.length,
    tokenRedemptions: redemptionCount,
    courtesyItems: courtesyCount,
    photoDeliveries: photoCount,
    tokenCards: cardCount,
    eventLogs: auditCount,
    dryRun: args.dryRun,
  });

  if (!reservations.length && !tokens.length && !auditCount) {
    console.log('No se encontraron registros de prueba con ese marcador.');
    return;
  }

  if (args.dryRun) {
    console.log('[dry-run] No se eliminará nada. Usa --apply para ejecutar el borrado.');
    if (reservations.length) {
      console.table(reservations.map((r) => ({
        id: r.id,
        celebrantName: r.celebrantName,
        date: r.date.toISOString().slice(0, 10),
      })));
    }
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (auditCount) {
      await tx.eventLog.deleteMany({
        where: {
          type: { startsWith: 'birthday.' },
          message: { contains: args.createdBy },
        },
      });
    }

    if (tokenIds.length) {
      await tx.tokenRedemption.deleteMany({ where: { tokenId: { in: tokenIds } } });
      await tx.inviteTokenCard.deleteMany({ where: { inviteTokenId: { in: tokenIds } } });
      await tx.inviteToken.deleteMany({ where: { id: { in: tokenIds } } });
    }

    if (reservationIds.length) {
      await tx.tokenRedemption.deleteMany({ where: { reservationId: { in: reservationIds } } });
      await tx.courtesyItem.deleteMany({ where: { reservationId: { in: reservationIds } } });
      await tx.photoDeliverable.deleteMany({ where: { reservationId: { in: reservationIds } } });
      await tx.birthdayReservation.deleteMany({ where: { id: { in: reservationIds } } });
    }
  });

  console.log(`Eliminadas ${reservations.length} reservas de prueba.`);
}

main()
  .catch((err) => {
    console.error('birthday-e2e-cleanup failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
