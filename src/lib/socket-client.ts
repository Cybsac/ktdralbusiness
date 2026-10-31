"use client";
import { io, type Socket } from "socket.io-client";

import {
  SOCKET_BOOTSTRAP_PATH,
  SOCKET_BOOTSTRAP_RETRY_MS,
  SOCKET_CHANNELS,
  SOCKET_PATH,
} from "./socket-contract";

type Connection = {
  socket: Socket;
  references: number;
  bootstrap?: Promise<void>;
  lastBootstrap: number;
};
let shared: Connection | null = null;
function bootstrap(connection: Connection) {
  if (connection.bootstrap) return;
  connection.lastBootstrap = Date.now();
  const origin = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
  connection.bootstrap = fetch(new URL(SOCKET_BOOTSTRAP_PATH, origin), {
    credentials: "include",
    cache: "no-store",
  })
    .then(
      () => {},
      () => {}
    )
    .finally(() => {
      connection.bootstrap = undefined;
      if (shared === connection && connection.references > 0) connection.socket.connect();
    });
}
export function acquireSocket(): Socket {
  if (!shared) {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      path: SOCKET_PATH,
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    const connection: Connection = { socket, references: 0, lastBootstrap: 0 };
    shared = connection;
    socket.on("connect_error", () => {
      if (
        shared === connection &&
        Date.now() - connection.lastBootstrap >= SOCKET_BOOTSTRAP_RETRY_MS
      )
        bootstrap(connection);
    });
  }
  shared.references++;
  if (!shared.socket.connected && !shared.socket.active) bootstrap(shared);
  return shared.socket;
}
export function releaseSocket(socket: Socket) {
  if (!shared || shared.socket !== socket) return;
  shared.references--;
  if (shared.references <= 0) {
    shared = null;
    socket.disconnect();
  }
}

// Reference counts prevent one component from leaving another component's room.
const memberships = new WeakMap<Socket, Map<string, { count: number; join: () => void }>>();
export function subscribeSocketChannel(
  socket: Socket,
  channel: import("./socket-contract").SocketChannel,
  id?: string
) {
  const definition = SOCKET_CHANNELS[channel];
  let rooms = memberships.get(socket);
  if (!rooms) {
    rooms = new Map();
    memberships.set(socket, rooms);
  }
  const key = JSON.stringify([channel, id]);
  let membership = rooms.get(key);
  if (!membership) {
    const join = () => {
      socket.emit(definition.event, id);
    };
    membership = { count: 0, join };
    rooms.set(key, membership);
    socket.on("connect", join);
    if (socket.connected) join();
  }
  membership.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--membership.count === 0) {
      socket.off("connect", membership.join);
      if (socket.connected) socket.emit(definition.leave, id);
      rooms.delete(key);
    }
  };
}
