import type { NextApiRequest } from "next";

import { initSocketIO, type NextApiResponseServerIo } from "../../lib/socket";

// Fallback bootstrap for next start / standalone. The custom server uses the same singleton.
export default function handler(req: NextApiRequest, res: NextApiResponseServerIo) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }
  initSocketIO(res.socket.server);
  res.setHeader("Cache-Control", "no-store");
  res.status(204).end();
}
