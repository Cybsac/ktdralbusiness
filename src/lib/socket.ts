/* global globalThis */
import type { Server as HttpServer } from "http";
import type { NextApiResponse } from "next";
import { Server as ServerIO } from "socket.io";

import { setupOffersSocketEvents } from "./socket/offers";
import { setupPrizeAuthorizationSocket } from "./socket/prize-authorization";
import { SOCKET_CHANNELS, SOCKET_PATH } from "./socket-contract";

declare global {
  var _goLoungeSocketServer: ServerIO | undefined;
}
export type NextApiResponseServerIo = NextApiResponse & {
  socket: { server: HttpServer & { io?: ServerIO } };
};
export const getGlobalIo = () => globalThis._goLoungeSocketServer ?? null;
export function emitSocketEvent(event: string, data: unknown, rooms?: string[]) {
  try {
    const io = getGlobalIo();
    if (!io) return false;
    if (rooms?.length) io.to(rooms).emit(event, data);
    else io.emit(event, data);
    return true;
  } catch {
    return false;
  }
}
export function initSocketIO(httpServer: HttpServer): ServerIO {
  const existing = getGlobalIo();
  if (existing) return existing;
  const configuredOrigins = (process.env.SOCKET_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const io = new ServerIO(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: true, credentials: true, methods: ["GET", "POST"] },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        callback(
          null,
          configuredOrigins.length
            ? configuredOrigins.includes(origin)
            : new URL(origin).host === req.headers.host
        );
      } catch {
        callback(null, false);
      }
    },
  });
  globalThis._goLoungeSocketServer = io;
  httpServer.once("close", () => {
    if (globalThis._goLoungeSocketServer === io) globalThis._goLoungeSocketServer = undefined;
  });
  io.on("connection", (socket) => {
    for (const [name, channel] of Object.entries(SOCKET_CHANNELS)) {
      const room = (id: unknown) => {
        if (["dj", "cashier", "tasks"].includes(name)) return channel.room("");
        if (name === "staff" && id === undefined) return channel.room("general");
        return typeof id === "string" && id.length > 0 && id.length <= 200
          ? channel.room(id)
          : null;
      };
      socket.on(channel.event, (id: unknown) => {
        const target = room(id);
        if (target) void socket.join(target);
      });
      socket.on(channel.leave, (id: unknown) => {
        const target = room(id);
        if (target) void socket.leave(target);
      });
    }
    setupPrizeAuthorizationSocket(socket);
  });
  setupOffersSocketEvents(io);
  return io;
}
