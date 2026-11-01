import type { Rating } from './daily-evaluation';

export const RATING_OPTIONS: { value: Rating; label: string; color: string; emoji: string }[] = [
  { value: 'MALO', label: 'Malo', color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700', emoji: '😞' },
  { value: 'REGULAR', label: 'Regular', color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700', emoji: '😐' },
  { value: 'BUENO', label: 'Bueno', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700', emoji: '😊' },
  { value: 'MUY_BUENO', label: 'Muy Bueno', color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700', emoji: '🤩' },
];
