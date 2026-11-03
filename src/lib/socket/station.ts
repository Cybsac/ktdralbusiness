import type { Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';
import { getSocketOperator } from './identity';
import { STATION_JOIN_EVENT, STATION_LEAVE_EVENT, stationRoom } from '../station/contracts';

type Ack = (result: { ok: boolean; message?: string }) => void;
export function setupStationSocket(socket: Socket) {
  socket.on(STATION_JOIN_EVENT, async (stationId: unknown, ack?: Ack) => {
    try {
      const user = await getSocketOperator(socket);
      if (!user || user.role !== 'ADMIN' || typeof stationId !== 'string') return ack?.({ ok: false });
      const station = await prisma.operationStation.findFirst({ where: { id: stationId, ownerId: user.userId, expiresAt: { gt: new Date() } } });
      if (!station) return ack?.({ ok: false });
      await socket.join(stationRoom(station.id));
      ack?.({ ok: true });
    } catch { ack?.({ ok: false }); }
  });
  socket.on(STATION_LEAVE_EVENT, (stationId: unknown) => { if (typeof stationId === 'string') void socket.leave(stationRoom(stationId)); });
}
