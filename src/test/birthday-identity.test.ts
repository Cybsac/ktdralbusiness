import { describe, expect, it } from "vitest";

import { suggestedCelebration } from "@/lib/birthdays/celebration";
import { reservationFields } from "@/lib/birthdays/reservation-input";

describe("fecha de nacimiento y celebración", () => {
  it("propone el cumpleaños próximo y mueve lunes a martes", () => {
    expect(suggestedCelebration("1990-11-09", new Date("2026-11-07T17:00:00Z"))).toBe("2026-11-10");
    expect(suggestedCelebration("1990-11-11", new Date("2026-11-07T17:00:00Z"))).toBe("2026-11-11");
  });
  it("conserva el martes cuando el cumpleaños cayó lunes ayer", () => {
    expect(suggestedCelebration("1990-11-09", new Date("2026-11-10T17:00:00Z"))).toBe("2026-11-10");
  });
  it("rechaza fechas de nacimiento imposibles y futuras", () => {
    expect(reservationFields.birthDate.safeParse("2000-02-31").success).toBe(false);
    expect(reservationFields.birthDate.safeParse("2999-01-01").success).toBe(false);
  });
});
