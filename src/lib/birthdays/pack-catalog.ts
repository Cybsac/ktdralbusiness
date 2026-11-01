import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BIRTHDAY_POLICY as P } from "./policy";
export const packUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(P.maxName).optional(),
    qrCount: z.number().int().min(1).max(P.maxPackQr).optional(),
    bottle: z.string().trim().max(500).optional(),
    perks: z.array(z.string().trim().max(500)).max(30).optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    priceSoles: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
const storedPack = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  qrCount: z.number().int().positive(),
  bottle: z.string(),
  perks: z.string(),
  active: z.boolean(),
  featured: z.boolean(),
  priceSoles: z.number().int().nonnegative(),
  isCustom: z.boolean(),
});
export async function restoreBirthdayPackCatalog() {
  const config = await prisma.birthdayPackCatalog.findUnique({ where: { id: "default" } });
  if (!config) throw new Error("PACK_CATALOG_NOT_CONFIGURED");
  const values = z.array(storedPack).parse(config.snapshot);
  return prisma.$transaction(async (tx) => {
    for (const { id, ...data } of values)
      await tx.birthdayPack.upsert({ where: { id }, update: data, create: { id, ...data } });
    return tx.birthdayPack.findMany({ orderBy: { name: "asc" } });
  });
}
export async function saveBirthdayPackCatalog() {
  const packs = await prisma.birthdayPack.findMany({ orderBy: { id: "asc" } });
  const snapshot = packs.map(
    ({ id, name, qrCount, bottle, perks, active, featured, priceSoles, isCustom }) => ({
      id,
      name,
      qrCount,
      bottle,
      perks,
      active,
      featured,
      priceSoles,
      isCustom,
    })
  );
  return prisma.birthdayPackCatalog.upsert({
    where: { id: "default" },
    create: { id: "default", snapshot },
    update: { snapshot },
  });
}
export function birthdayPackDto<T extends { perks: string }>(pack: T) {
  let perks: string[] = [];
  try {
    const value: unknown = JSON.parse(pack.perks);
    if (Array.isArray(value))
      perks = value.filter((item): item is string => typeof item === "string");
  } catch {}
  return { ...pack, perks };
}
