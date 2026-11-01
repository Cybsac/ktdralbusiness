import { z } from 'zod';
import type { Prisma } from '@prisma/client';

export const purgeFilterSchema = z.object({
  search: z.string().trim().max(200).default(''),
  usage: z.enum(['all', 'unused', 'used']).default('all'),
  asOf: z.string().datetime(),
});
export type PurgeFilter = z.infer<typeof purgeFilterSchema>;
export function purgeWhere(filter: PurgeFilter): Prisma.ReusableTokenWhereInput {
  return {
    createdAt: { lte: new Date(filter.asOf) },
    ...(filter.usage === 'unused' ? { usedCount: 0 } : filter.usage === 'used' ? { usedCount: { gt: 0 } } : {}),
    ...(filter.search ? { OR: [
      { id: { contains: filter.search, mode: 'insensitive' } },
      { prize: { label: { contains: filter.search, mode: 'insensitive' } } },
      { prize: { key: { contains: filter.search, mode: 'insensitive' } } },
    ] } : {}),
  };
}
export const deletableWhere: Prisma.ReusableTokenWhereInput = { usedCount: 0, redemptions: { none: {} } };
