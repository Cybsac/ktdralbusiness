// Shared by the generator, server validation and public input.
export const PRIZE_CODE_DIGITS = 4;
export const PRIZE_CODE_SPACE = 10 ** PRIZE_CODE_DIGITS;
export const PRIZE_CODE_PATTERN = `[0-9]{${PRIZE_CODE_DIGITS}}`;
export function isPrizeCode(value: string) {
  return new RegExp(`^${PRIZE_CODE_PATTERN}$`).test(value);
}
