import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ operator: vi.fn() }));
vi.mock("@/lib/prize-authorization/service", () => ({ getPrizeOperator: mocks.operator }));
import { birthdayManager, birthdayPackAdministrator } from "@/lib/birthdays/managementAuth";

describe("permisos del catálogo de cumpleaños", () => {
  const request = new Request("http://localhost");
  it.each(["COLLAB", "STAFF", "COORDINATOR"])(
    "permite consultar como %s sin administrar packs",
    async (role) => {
      mocks.operator.mockResolvedValue({ role });
      expect(await birthdayManager(request)).toEqual({ role });
      expect(await birthdayPackAdministrator(request)).toBeNull();
    }
  );
  it("permite administrar solo a ADMIN activo y rechaza sesiones inválidas", async () => {
    mocks.operator.mockResolvedValueOnce({ role: "ADMIN" }).mockResolvedValueOnce(null);
    expect(await birthdayPackAdministrator(request)).toEqual({ role: "ADMIN" });
    expect(await birthdayPackAdministrator(request)).toBeNull();
  });
});
