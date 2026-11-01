import { GAME_RESULT_KEYS } from "@/lib/prize-games/contracts";
export const STATIC_CONTENT_PRIZE_KEY = "static_content";
export const STATIC_HIDDEN_PRIZE_KEYS = [
  ...Object.values(GAME_RESULT_KEYS),
  STATIC_CONTENT_PRIZE_KEY,
];
export const staticPrizeWhere = {
  staticEnabled: true,
  isReusable: false,
  key: { notIn: STATIC_HIDDEN_PRIZE_KEYS },
};
export const staticPrizeCreateFields = {
  staticEnabled: true,
  gameEnabled: false,
  isReusable: false,
};

const prizeOrder = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
export function compareStaticPrizes(
  a: { key: string | null; label: string },
  b: { key: string | null; label: string }
) {
  return prizeOrder.compare(a.key || "", b.key || "") || prizeOrder.compare(a.label, b.label);
}
