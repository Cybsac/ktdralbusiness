import { currentBusinessDay } from '@/lib/attendanceDay';
import { isBusinessDay } from '@/lib/daily-evaluation';

export const JOURNEY_CATEGORIES = ['reusable', 'roulette', 'interactive', 'birthday'] as const;
export type JourneyCategory = (typeof JOURNEY_CATEGORIES)[number];
export function journeyDay(day: string | null): string | null {
  return day === null ? currentBusinessDay() : isBusinessDay(day) ? day : null;
}
export function canViewJourneyOperator(viewerRole: string, viewerId: string, operatorRole: string, operatorId: string) {
  return viewerId === operatorId || viewerRole === 'ADMIN' || (viewerRole === 'COORDINATOR' && operatorRole !== 'ADMIN');
}
export function isBirthdayHost(location: string | null) {
  return location === 'host' || Boolean(location?.startsWith('host:'));
}
