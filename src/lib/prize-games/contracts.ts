export const GAME_POLICY = { transactionAttempts: 3, minimumRouletteSegments: 2 } as const;
export const GAME_RESULT_KEYS = { retry: "retry", lose: "lose" } as const;
export type GameAction = "RETRY" | "LOSE" | "PRIZE";
export function gameAction(key: string): GameAction {
  return key === GAME_RESULT_KEYS.retry
    ? "RETRY"
    : key === GAME_RESULT_KEYS.lose
      ? "LOSE"
      : "PRIZE";
}
export class PrizeGameError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export type ContinuationState = "READY" | "REVEALED" | "DELIVERED" | "UNAVAILABLE";
export interface GameContinuation {
  tokenId: string;
  state: ContinuationState;
  code?: string;
  message?: string;
}
