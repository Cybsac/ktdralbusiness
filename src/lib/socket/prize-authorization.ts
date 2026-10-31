import type { Socket } from "socket.io";

import { getSocketOperator } from "./identity";
import {
  PRIZE_AUTH_ROOM_PREFIX,
  PRIZE_AUTH_ROOMS,
  PRIZE_AUTH_SUBSCRIBE,
} from "../prize-authorization/realtime-contract";

export function setupPrizeAuthorizationSocket(socket: Socket) {
  socket.on(PRIZE_AUTH_SUBSCRIBE, async (ack?: (_result: { ok: boolean }) => void) => {
    // Revalidate on every subscription. Never accept a user ID or room from the client.
    for (const room of [...socket.rooms])
      if (room.startsWith(PRIZE_AUTH_ROOM_PREFIX)) socket.leave(room);
    try {
      const session = await getSocketOperator(socket);
      if (!session) {
        if (typeof ack === "function") ack({ ok: false });
        return;
      }
      await socket.join([PRIZE_AUTH_ROOMS.users, PRIZE_AUTH_ROOMS.user(session.userId)]);
      if (["ADMIN", "COORDINATOR"].includes(session.role))
        await socket.join(PRIZE_AUTH_ROOMS.administrators);
      if (typeof ack === "function") ack({ ok: true });
    } catch {
      if (typeof ack === "function") ack({ ok: false });
    }
  });
}
