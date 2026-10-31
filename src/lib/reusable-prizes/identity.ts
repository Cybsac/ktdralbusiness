import { randomUUID } from "crypto";

import { choosePrizeColor, PRIZE_COLOR_POLICY } from "@/lib/prize-colors";
export const PRIZE_IDENTITY_POLICY = { ...PRIZE_COLOR_POLICY, transactionAttempts: 3 } as const;
export function generateReusablePrizeKey() {
  return `RP_${randomUUID().replace(/-/g, "").toUpperCase()}`;
}
export const chooseReusablePrizeColor = choosePrizeColor;
