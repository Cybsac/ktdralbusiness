import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/apiError";
import {
  createInvitation,
  hashInvitation,
  stationExpiry,
  stationUser,
} from "@/lib/station/service";
import { emitSocketEvent } from "@/lib/socket";
import {
  STATION_READINGS_PAGE_SIZE,
  STATION_REFRESH_EVENT,
  STATION_SCAN_MAX_LENGTH,
  STATION_TERMINAL_OFFLINE_AFTER_MS,
  stationRoom,
} from "@/lib/station/contracts";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await stationUser(req);
  if (!user) return apiError("UNAUTHORIZED", "Inicia sesión", undefined, 401);
  try {
    const body = await req.json();
    if (body.action === "create") {
      const station = await prisma.operationStation.create({
        data: { ownerId: user.id, expiresAt: stationExpiry() },
      });
      return apiOk({ stationId: station.id, owner: user.name, expiresAt: station.expiresAt });
    }
    if (body.action === "invite" && typeof body.stationId === "string") {
      const station = await prisma.operationStation.findFirst({
        where: { id: body.stationId, ownerId: user.id, expiresAt: { gt: new Date() } },
      });
      if (!station) return apiError("NOT_FOUND", "Estación no disponible", undefined, 404);
      const invitation = createInvitation();
      await prisma.stationInvitation.create({
        data: {
          stationId: station.id,
          tokenHash: hashInvitation(invitation.token),
          expiresAt: invitation.expiresAt,
        },
      });
      return apiOk(invitation);
    }
    if (
      body.action === "pair" &&
      typeof body.token === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(body.token)
    ) {
      const tokenHash = hashInvitation(body.token);
      const terminal = await prisma.$transaction(async (tx) => {
        const invite = await tx.stationInvitation.findUnique({
          where: { tokenHash },
          include: { station: true },
        });
        const now = new Date();
        if (!invite || invite.usedAt || invite.expiresAt <= now || invite.station.expiresAt <= now)
          return null;
        const consumed = await tx.stationInvitation.updateMany({
          where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) return null;
        return tx.stationTerminal.create({
          data: { stationId: invite.stationId, userId: user.id },
        });
      });
      if (!terminal)
        return apiError(
          "INVALID_INVITATION",
          "El QR de vinculación ha expirado o ya fue usado",
          undefined,
          400
        );
      emitSocketEvent(STATION_REFRESH_EVENT, {}, [stationRoom(terminal.stationId)]);
      return apiOk({ terminalId: terminal.id, stationId: terminal.stationId });
    }
    if (body.action === "status" && typeof body.stationId === "string") {
      const station = await prisma.operationStation.findFirst({
        where: { id: body.stationId, ownerId: user.id, expiresAt: { gt: new Date() } },
        include: { terminals: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } } },
      });
      if (!station) return apiError("NOT_FOUND", "Estación no disponible", undefined, 404);
      const users = await prisma.user.findMany({
        where: { id: { in: station.terminals.map((t) => t.userId) } },
        select: { id: true, username: true, person: { select: { name: true } } },
      });
      const names = new Map(users.map((u) => [u.id, u.person?.name || u.username]));
      const readings = await prisma.stationReading.findMany({
        where: { stationId: station.id, text: { not: "" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: STATION_READINGS_PAGE_SIZE,
        select: { id: true, text: true, senderName: true, createdAt: true },
      });
      return apiOk({
        stationId: station.id,
        owner: user.name,
        expiresAt: station.expiresAt,
        terminals: station.terminals.map((t) => ({
          id: t.id,
          name: names.get(t.userId) || "Colaborador",
          online:
            !!t.lastSeenAt &&
            Date.now() - t.lastSeenAt.getTime() < STATION_TERMINAL_OFFLINE_AFTER_MS,
        })),
        readings,
      });
    }
    if (body.action === "terminal" && typeof body.terminalId === "string") {
      const terminal = await prisma.stationTerminal.findFirst({
        where: {
          id: body.terminalId,
          userId: user.id,
          revokedAt: null,
          station: { expiresAt: { gt: new Date() } },
        },
        select: { id: true, stationId: true },
      });
      if (!terminal) return apiError("NOT_FOUND", "Vinculación no disponible", undefined, 404);
      await prisma.stationTerminal.update({
        where: { id: terminal.id },
        data: { lastSeenAt: new Date() },
      });
      return apiOk({ terminalId: terminal.id, stationId: terminal.stationId });
    }
    if (
      body.action === "scan" &&
      typeof body.terminalId === "string" &&
      typeof body.readingId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.readingId
      ) &&
      typeof body.text === "string" &&
      body.text.trim() &&
      body.text.length <= STATION_SCAN_MAX_LENGTH
    ) {
      const terminal = await prisma.stationTerminal.findFirst({
        where: {
          id: body.terminalId,
          userId: user.id,
          revokedAt: null,
          station: { expiresAt: { gt: new Date() } },
        },
      });
      if (!terminal) return apiError("NOT_FOUND", "Vinculación no disponible", undefined, 404);
      const reading = await prisma.stationReading.upsert({
        where: { id: body.readingId },
        update: {},
        create: {
          id: body.readingId,
          stationId: terminal.stationId,
          terminalId: terminal.id,
          userId: user.id,
          senderName: user.name,
          text: body.text,
        },
      });
      if (
        reading.terminalId !== terminal.id ||
        reading.userId !== user.id ||
        (reading.text !== "" && reading.text !== body.text)
      )
        return apiError("CONFLICT", "Lectura inválida", undefined, 409);
      emitSocketEvent(STATION_REFRESH_EVENT, {}, [stationRoom(terminal.stationId)]);
      return apiOk({ accepted: true });
    }
    if (body.action === "revoke" && typeof body.terminalId === "string") {
      const terminal = await prisma.stationTerminal.findFirst({
        where: {
          id: body.terminalId,
          revokedAt: null,
          OR: [{ userId: user.id }, { station: { ownerId: user.id } }],
        },
      });
      if (!terminal) return apiError("NOT_FOUND", "Vinculación no disponible", undefined, 404);
      await prisma.stationTerminal.update({
        where: { id: terminal.id },
        data: { revokedAt: new Date() },
      });
      emitSocketEvent(STATION_REFRESH_EVENT, {}, [stationRoom(terminal.stationId)]);
      return apiOk({ success: true });
    }
    return apiError("BAD_REQUEST", "Solicitud inválida", undefined, 400);
  } catch (error) {
    console.error("station request failed", error);
    return apiError("INTERNAL_ERROR", "No se pudo completar la operación", undefined, 500);
  }
}
