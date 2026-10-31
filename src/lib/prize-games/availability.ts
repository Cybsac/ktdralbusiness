import { PrizeGameError } from "./contracts";

export interface GameValidity {
  disabled: boolean;
  expiresAt: Date;
  validFrom?: Date | null;
  startTime?: Date | null;
  endTime?: Date | null;
  prize?: { active: boolean };
  batch?: { functionalDate?: Date | null } | null;
}
export function gameAvailableFrom(token: GameValidity): Date | null {
  const dates = [token.validFrom, token.startTime, token.batch?.functionalDate].filter(
    (date): date is Date => !!date
  );
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}
export function gameAvailability(token: GameValidity, now = new Date()): PrizeGameError | null {
  if (
    token.expiresAt.getTime() <= now.getTime() ||
    (token.endTime && token.endTime.getTime() <= now.getTime())
  )
    return new PrizeGameError("EXPIRED", "Token expirado", 410);
  if (token.disabled || token.prize?.active === false)
    return new PrizeGameError("INACTIVE", "Token deshabilitado", 409);
  const start = gameAvailableFrom(token);
  if (start && start.getTime() > now.getTime())
    return new PrizeGameError("NOT_YET_VALID", "El token aún no está vigente", 409);
  return null;
}
