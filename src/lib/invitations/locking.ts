import { Prisma } from "@prisma/client";
export async function lockEvent(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "SpecialEvent" WHERE id=${id} FOR UPDATE`
  );
  if (!rows.length) throw new Error("EVENT_NOT_FOUND");
}
