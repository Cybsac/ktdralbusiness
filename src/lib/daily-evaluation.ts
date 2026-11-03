export const RATING_LEVELS = ['MALO', 'REGULAR', 'BUENO', 'MUY_BUENO'] as const;
export type Rating = (typeof RATING_LEVELS)[number];
export const MISSING_EXIT_REASON = 'MISSING_EXIT';
export const MISSING_EXIT_NOTE = 'Ajuste automático: no registró salida al cerrar la jornada.';
export const EVALUABLE_USER_ROLES = ['COLLAB', 'STAFF'] as const;
export const DAILY_EVALUATION_TIME_ZONE = 'America/Lima';

export function isRating(value: unknown): value is Rating {
  return typeof value === 'string' && (RATING_LEVELS as readonly string[]).includes(value);
}

export function ratingPoints(rating: Rating): number {
  return RATING_LEVELS.indexOf(rating) + 1;
}

export function isBusinessDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Apply the adjustment once; its persisted reason is the source of truth. */
export function adjustMissingExit(rating: Rating, note: string, previouslyAdjusted: boolean) {
  if (previouslyAdjusted) return { rating, note };
  const index = RATING_LEVELS.indexOf(rating);
  return {
    rating: RATING_LEVELS[Math.max(0, index - 1)],
    note: note.includes(MISSING_EXIT_NOTE) ? note : [note, MISSING_EXIT_NOTE].filter(Boolean).join(' | '),
  };
}

export const EVALUATION_VIEW_ROLES = ['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'] as const;
export function canViewDailyEvaluation(role: string): boolean {
  return (EVALUATION_VIEW_ROLES as readonly string[]).includes(role);
}

export const EVALUATION_MANAGEMENT_ROLES = ['ADMIN', 'COORDINATOR'] as const;
export function canManageDailyEvaluation(role: string): boolean {
  return (EVALUATION_MANAGEMENT_ROLES as readonly string[]).includes(role);
}
