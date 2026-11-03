import type { Prisma } from "@prisma/client";
export async function lockBirthdayDocument(
  tx: Prisma.TransactionClient,
  documento: string,
  year: number
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`birthday:${documento}:${year}`}))::text`;
}
export async function lockBirthdayReservation(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "BirthdayReservation" WHERE id=${id} FOR UPDATE`;
}
export async function lockBirthdaySlot(tx: Prisma.TransactionClient, day: string, slot: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`birthday-slot:${day}:${slot}`}))::text`;
}
