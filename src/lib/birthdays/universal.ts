import { BIRTHDAY_POLICY as P } from "./policy";
export function universalInvitation<T extends { kind: string; maxUses?: number | null }>(
  tokens: T[]
): T | undefined {
  return (
    tokens.find((token) => token.kind === P.universalTokenKind && (token.maxUses ?? 0) > 1) ||
    tokens.find((token) => token.kind === P.universalTokenKind) ||
    tokens.find((token) => token.kind === P.legacyTokenKind)
  );
}
