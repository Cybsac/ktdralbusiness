import { createHmac, timingSafeEqual } from "crypto";
import { DateTime } from "luxon";

import { isPrizeCode, PRIZE_CODE_DIGITS, PRIZE_CODE_SPACE } from "./code-format";

import type { PrizePolicy, PrizeScope } from "./policy";

export function policyWindow(policy: PrizePolicy, _scope: PrizeScope, now = new Date()) {
  // The project's Luxon declaration exposes only a subset of the installed API.
  const local = DateTime.fromJSDate(now).setZone(policy.timezone) as any;
  const date: string = local.toISODate();
  const scheduled =
    policy.schedule === "always" ||
    (policy.schedule === "dates"
      ? policy.dates.includes(date)
      : !!policy.startsAt &&
        !!policy.endsAt &&
        now >= new Date(policy.startsAt) &&
        now < new Date(policy.endsAt));
  const required =
    policy.enabled &&
    scheduled &&
    (!policy.weekdays.length || policy.weekdays.includes(local.weekday));
  let start: Date;
  let end: Date | null;
  if (policy.rotation === "interval") {
    const duration = policy.intervalMinutes * 60000;
    const index = Math.floor((now.getTime() - new Date(policy.anchorAt).getTime()) / duration);
    start = new Date(new Date(policy.anchorAt).getTime() + index * duration);
    end = new Date(start.getTime() + duration);
  } else if (policy.rotation === "fixed") {
    start = new Date(policy.anchorAt);
    end = policy.schedule === "range" && policy.endsAt ? new Date(policy.endsAt) : null;
  } else {
    const unit = { daily: "day", weekly: "week", monthly: "month" }[policy.rotation];
    const boundary = local.startOf(unit);
    start = boundary.toJSDate();
    end = boundary.plus({ [unit + "s"]: 1 }).toJSDate();
  }
  return {
    required,
    period: `${policy.rotation}:${start.toISOString()}`,
    validUntil: end?.toISOString() ?? null,
  };
}
export function generatePrizeCode(secret: string, revision: number, period: string) {
  const digest = createHmac("sha256", secret)
    .update(`prize-authorization:v1:${revision}:${period}`)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % PRIZE_CODE_SPACE)
    .toString()
    .padStart(PRIZE_CODE_DIGITS, "0");
}
export function verifyPrizeCode(code: string, expected: string) {
  return (
    isPrizeCode(code) &&
    isPrizeCode(expected) &&
    timingSafeEqual(Buffer.from(code), Buffer.from(expected))
  );
}
