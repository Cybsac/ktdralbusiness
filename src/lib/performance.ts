import { DateTime } from 'luxon';
import { DAILY_EVALUATION_TIME_ZONE, isRating, ratingPoints, RATING_LEVELS, type Rating } from './daily-evaluation';

export function performancePeriods(currentDay: string) {
  const today = DateTime.fromISO(currentDay, { zone: DAILY_EVALUATION_TIME_ZONE });
  return {
    weekStart: today.startOf('week').toFormat('yyyy-MM-dd'),
    thirtyDayStart: today.minus({ days: 29 }).toFormat('yyyy-MM-dd'),
    previousStart: today.minus({ days: 59 }).toFormat('yyyy-MM-dd'),
    previousEnd: today.minus({ days: 30 }).toFormat('yyyy-MM-dd'),
  };
}

export function summarizeRatings(ratings: { businessDay: string; rating: string }[]) {
  const distribution = Object.fromEntries(RATING_LEVELS.map(rating => [rating, 0])) as Record<Rating, number>;
  let total = 0;
  const days = new Set<string>();
  let count = 0;
  for (const item of ratings) {
    if (!isRating(item.rating)) continue;
    total += ratingPoints(item.rating);
    distribution[item.rating]++;
    days.add(item.businessDay);
    count++;
  }
  const averageScore = count ? Number((total / count).toFixed(2)) : null;
  const level = averageScore === null ? null : RATING_LEVELS[Math.min(RATING_LEVELS.length - 1, Math.max(0, Math.round(averageScore) - 1))];
  return { averageScore, level, evaluatedDays: days.size, points: total, distribution };
}
