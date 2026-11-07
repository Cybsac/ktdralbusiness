import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getUserSessionCookieFromRequest: () => "cookie",
  verifyUserSessionCookie: m.session,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: m.user } } }));
import { admissionActor } from "@/lib/admission/access";
describe("permisos de admisión", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.session.mockResolvedValue({ userId: "u" });
  });
  it.each(["ADMIN", "COORDINATOR", "STAFF"])("permite %s activo", async (role) => {
    m.user.mockResolvedValue({ id: "u", role, person: { active: true, area: "Barra" } });
    expect(await admissionActor(new Request("http://localhost"))).toMatchObject({
      userId: "u",
      role,
    });
  });
  it("permite colaboradores activos de seguridad y rechaza otras áreas e inactivos", async () => {
    m.user.mockResolvedValueOnce({
      id: "u",
      role: "COLLAB",
      person: { active: true, area: "Seguridad" },
    });
    expect(await admissionActor(new Request("http://localhost"))).not.toBeNull();
    m.user.mockResolvedValueOnce({
      id: "u",
      role: "COLLAB",
      person: { active: true, area: "Barra" },
    });
    expect(await admissionActor(new Request("http://localhost"))).toBeNull();
    m.user.mockResolvedValueOnce({
      id: "u",
      role: "ADMIN",
      person: { active: false, area: "Seguridad" },
    });
    expect(await admissionActor(new Request("http://localhost"))).toBeNull();
  });
});
