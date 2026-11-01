import { prisma } from "@/lib/prisma";
import {
  invitationExpiration,
  invitationToday,
  invitationDay,
  assertEventAvailable,
} from "./calendar";
import { lockEvent } from "./locking";
import { persistInvitationClaims } from "./claims";
import { deferTemplate } from "./template-assets";
export type CreateEventInput = {
  name: string;
  description?: string | null;
  date: Date;
  timeSlot: string;
  location?: string | null;
  maxGuests?: number | null;
  templateUrl?: string | null;
  createdBy?: string;
};
export async function createEvent(input: CreateEventInput) {
  if (invitationDay(input.date) < invitationToday()) throw new Error("DATE_PAST");
  return prisma.$transaction(async (tx) => {
    await deferTemplate(tx, input.templateUrl, invitationExpiration(input.date));
    return tx.specialEvent.create({ data: { ...input, status: "active" } });
  });
}
export async function updateEvent(id: string, data: Partial<Omit<CreateEventInput, "createdBy">>) {
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, id);
    const current = await tx.specialEvent.findUniqueOrThrow({ where: { id } });
    if (data.date && invitationDay(data.date) < invitationToday()) throw new Error("DATE_PAST");
    const dateChanged = data.date && data.date.getTime() !== current.date.getTime();
    if (
      dateChanged &&
      (await tx.specialInvitation.count({ where: { eventId: id, arrivedAt: { not: null } } }))
    )
      throw new Error("ALREADY_USED");
    if (
      data.maxGuests != null &&
      data.maxGuests <
        (await tx.specialInvitation.count({ where: { eventId: id, status: { not: "cancelled" } } }))
    )
      throw new Error("CAPACITY_EXCEEDED");
    if (data.templateUrl) {
      assertEventAvailable({ ...current, date: data.date || current.date });
      await deferTemplate(tx, data.templateUrl, invitationExpiration(data.date || current.date));
    }
    const updated = await tx.specialEvent.update({ where: { id }, data });
    if (dateChanged) {
      const invitations = await tx.specialInvitation.findMany({
        where: { eventId: id, code: { not: null } },
      });
      const expiresAt = invitationExpiration(updated.date);
      await persistInvitationClaims(
        tx,
        id,
        invitations.map((invitation) => ({ id: invitation.id, code: invitation.code! })),
        expiresAt
      );
    }
    if (current.templateUrl && current.templateUrl !== updated.templateUrl)
      await tx.invitationTemplateAsset.updateMany({
        where: { url: current.templateUrl },
        data: { nextCheckAt: new Date() },
      });
    if (updated.templateUrl)
      await deferTemplate(tx, updated.templateUrl, invitationExpiration(updated.date));
    return updated;
  });
}
async function setEventStatus(id: string, status: "cancelled" | "completed") {
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, id);
    const event = await tx.specialEvent.findUniqueOrThrow({ where: { id } });
    if (event.status !== status && !["draft", "active"].includes(event.status))
      throw new Error("INVALID_TRANSITION");
    const updated = await tx.specialEvent.update({ where: { id }, data: { status } });
    if (event.templateUrl)
      await tx.invitationTemplateAsset.updateMany({
        where: { url: event.templateUrl },
        data: { nextCheckAt: new Date() },
      });
    return updated;
  });
}
export const cancelEvent = (id: string) => setEventStatus(id, "cancelled");
export const completeEvent = (id: string) => setEventStatus(id, "completed");
export const getEvent = (id: string) =>
  prisma.specialEvent.findUnique({
    where: { id },
    include: { invitations: { orderBy: { createdAt: "asc" } } },
  });
