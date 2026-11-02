import { prisma } from '@/lib/prisma';
import { EVALUABLE_USER_ROLES } from '@/lib/daily-evaluation';

export async function attendance(day: string) {
// Attendance: people who scanned IN this business day
const scans = await prisma.scan.findMany({
  where: { businessDay: day },
  include: { person: { select: { id: true, name: true, code: true, area: true } } },
  orderBy: { scannedAt: 'asc' },
});

// Group scans by person
const personMap = new Map<string, {
  person: { id: string; name: string; code: string; area: string | null };
  firstIn: Date | null;
  lastOut: Date | null;
  hasExit: boolean;
}>();

for (const scan of scans) {
  if (!personMap.has(scan.personId)) {
    personMap.set(scan.personId, {
      person: scan.person,
      firstIn: null,
      lastOut: null,
      hasExit: false,
    });
  }
  const entry = personMap.get(scan.personId)!;
  if (scan.type === 'IN' && (!entry.firstIn || scan.scannedAt < entry.firstIn)) {
    entry.firstIn = scan.scannedAt;
  }
  if (scan.type === 'OUT') {
    entry.hasExit = true;
    if (!entry.lastOut || scan.scannedAt > entry.lastOut) {
      entry.lastOut = scan.scannedAt;
    }
  }
}

const eligiblePeople = await prisma.person.findMany({ where: { id: { in: Array.from(personMap.keys()) }, active: true, user: { role: { in: [...EVALUABLE_USER_ROLES] } } }, select: { id: true } });
const eligibleIds = new Set(eligiblePeople.map(person => person.id));
const attendance = Array.from(personMap.values()).map((a) => ({
  evaluable: !!a.firstIn && eligibleIds.has(a.person.id),
  person: a.person,
  firstIn: a.firstIn?.toISOString() ?? null,
  lastOut: a.lastOut?.toISOString() ?? null,
  missingExit: !a.hasExit,
}));
  return attendance;
}
