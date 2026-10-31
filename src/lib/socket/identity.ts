import type { Socket } from "socket.io";

export async function getSocketOperator(socket: Socket) {
  const host = socket.request.headers.host;
  if (!host) return null;
  const { getPrizeOperator } = await import("../prize-authorization/service");
  const request = new Request(`${socket.handshake.secure ? "https" : "http"}://${host}/`, {
    headers: { cookie: socket.request.headers.cookie || "" },
  });
  return getPrizeOperator(request);
}
