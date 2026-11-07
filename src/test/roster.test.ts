import { describe, expect, it } from "vitest";
import { canEditRoster, rosterDaySchema, rosterRoleKey, rosterRoleNameSchema } from "@/lib/roster/input";
describe("jornadas y funciones", () => {
  it("acepta solo fechas reales", () => {
    expect(rosterDaySchema.safeParse("2026-02-30").success).toBe(false);
    expect(rosterDaySchema.safeParse("2026-11-07").success).toBe(true);
  });
  it("evita funciones duplicadas por mayúsculas, espacios o acentos", () => {
    const name = rosterRoleNameSchema.parse("  Animación  ");
    expect(rosterRoleKey(name)).toBe(rosterRoleKey("animacion"));
  });
  it("solo permite modificar a administración y coordinación", () => {
    expect(canEditRoster("ADMIN")).toBe(true);
    expect(canEditRoster("COORDINATOR")).toBe(true);
    expect(canEditRoster("STAFF")).toBe(false);
    expect(canEditRoster("COLLAB")).toBe(false);
  });
});
