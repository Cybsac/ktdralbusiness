export const BIRTHDAY_RESERVATION_SOURCES = ['PUBLIC', 'ADMIN', 'USER_PORTAL', 'LEGACY'] as const;

export type BirthdayReservationSource = typeof BIRTHDAY_RESERVATION_SOURCES[number];

export function normalizeBirthdayReservationSource(value?: string | null): BirthdayReservationSource {
  if (value === 'PUBLIC' || value === 'ADMIN' || value === 'USER_PORTAL') return value;
  return 'LEGACY';
}

export function birthdayReservationSourceLabel(value?: string | null): string {
  switch (normalizeBirthdayReservationSource(value)) {
    case 'PUBLIC': return 'Público';
    case 'ADMIN': return 'Admin';
    case 'USER_PORTAL': return 'Portal /u';
    default: return 'Histórico';
  }
}
