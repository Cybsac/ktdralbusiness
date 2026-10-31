export const PRIZE_AUTH_ROOM_PREFIX = "prize-authorization:";
export const PRIZE_AUTH_SUBSCRIBE = "prize-authorization:subscribe";
export const PRIZE_AUTH_CHANGED = "prize-authorization:changed";
export const PRIZE_AUTH_POLL_MS = 30000;
export const PRIZE_AUTH_ROOMS = {
  users: `${PRIZE_AUTH_ROOM_PREFIX}users`,
  administrators: `${PRIZE_AUTH_ROOM_PREFIX}administrators`,
  user: (userId: string) => `${PRIZE_AUTH_ROOM_PREFIX}user:${userId}`,
};
export type PrizeAuthorizationChange = { kind: "configuration" | "credential" };
