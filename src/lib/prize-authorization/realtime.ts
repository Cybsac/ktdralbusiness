import {
  PRIZE_AUTH_CHANGED,
  PRIZE_AUTH_ROOMS,
  type PrizeAuthorizationChange,
} from "./realtime-contract";
import { emitSocketEvent } from "../socket";

// Notification only: the authenticated HTTP API remains the source of every code.
export function notifyPrizeAuthorizationChanged(userId?: string) {
  const payload: PrizeAuthorizationChange = { kind: userId ? "credential" : "configuration" };
  emitSocketEvent(
    PRIZE_AUTH_CHANGED,
    payload,
    userId
      ? [PRIZE_AUTH_ROOMS.user(userId), PRIZE_AUTH_ROOMS.administrators]
      : [PRIZE_AUTH_ROOMS.users]
  );
}
