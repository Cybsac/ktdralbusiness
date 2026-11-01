import { INVITATION_POLICY as P } from "./policy";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lockEvent } from "./locking";
import { assertEventAvailable } from "./calendar";
import { guestSchema, updateGuestSchema } from "./input";
export type AddGuestInput = z.infer<typeof guestSchema>;
async function insertGuests(
  tx: Prisma.TransactionClient,
  eventId: string,
  guests: AddGuestInput[]
) {
  await lockEvent(tx, eventId);
  const event = await tx.specialEvent.findUniqueOrThrow({ where: { id: eventId } });
  assertEventAvailable(event);
  const parsed = guests.map((input) => guestSchema.parse(input));
  const names = parsed.map((g) => g.guestName.toLocaleLowerCase());
  if (new Set(names).size !== names.length) throw new Error("DUPLICATE_NAME");
  if (
    await tx.specialInvitation.findFirst({
      where: {
        eventId,
        OR: parsed.map((g) => ({
          guestName: { equals: g.guestName, mode: "insensitive" as const },
        })),
      },
    })
  )
    throw new Error("DUPLICATE_NAME");
  if (
    event.maxGuests != null &&
    (await tx.specialInvitation.count({ where: { eventId, status: { not: "cancelled" } } })) +
      parsed.length >
      event.maxGuests
  )
    throw new Error("CAPACITY_EXCEEDED");
  return tx.specialInvitation.createManyAndReturn({
    data: parsed.map((guest) => ({ eventId, ...guest, status: "pending" })),
  });
}
export async function addGuest(eventId: string, input: AddGuestInput) {
  const [guest] = await prisma.$transaction((tx) => insertGuests(tx, eventId, [input]));
  return guest;
}
export const bulkAddGuests = (eventId: string, guests: AddGuestInput[]) =>
  prisma.$transaction((tx) => insertGuests(tx, eventId, guests), {
    timeout: P.transactionTimeoutMs,
  });
export async function updateGuest(
  eventId: string,
  id: string,
  data: z.infer<typeof updateGuestSchema>
) {
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    const current = await tx.specialInvitation.findFirst({ where: { id, eventId } });
    if (!current) throw new Error("INVITATION_NOT_FOUND");
    const event = await tx.specialEvent.findUniqueOrThrow({ where: { id: eventId } });
    assertEventAvailable(event);
    const parsed = updateGuestSchema.parse(data);
    if (
      parsed.guestName &&
      (await tx.specialInvitation.findFirst({
        where: {
          eventId,
          id: { not: id },
          guestName: { equals: parsed.guestName, mode: "insensitive" },
        },
      }))
    )
      throw new Error("DUPLICATE_NAME");
    return tx.specialInvitation.update({ where: { id }, data: parsed });
  });
}
export async function removeGuest(eventId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    const current = await tx.specialInvitation.findFirst({ where: { id, eventId } });
    if (!current) throw new Error("INVITATION_NOT_FOUND");
    if (current.arrivedAt) throw new Error("ALREADY_ARRIVED");
    return tx.specialInvitation.delete({ where: { id } });
  });
}
export const listGuests = (eventId: string) =>
  prisma.specialInvitation.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
