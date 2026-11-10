import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocked = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSessionCookieFromRequest: () => "session",
  verifySessionCookie: async () => ({ userId: "admin", role: "ADMIN" }),
  requireRole: () => ({ ok: true }),
}));
vi.mock("@/lib/reusable-tokens/generation", () => ({ generateReusableToken: mocked.generate }));
vi.mock("@/lib/config", () => ({ getPublicBaseUrl: () => "https://example.test" }));
import { POST } from "@/app/api/admin/reusable-tokens/generate-single/route";

function request() {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestKey: "12345678-1234-4234-8234-123456789abc",
      prizeId: "prize",
      maxUses: 2,
      validity: { type: "specific_date", date: "2030-11-12" },
    }),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("protección de creación programada", () => {
  it("bloquea por defecto la creación desde desarrollo", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REUSABLE_SCHEDULED_LOCAL_ENABLED", "");
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocked.generate).not.toHaveBeenCalled();
  });
  it("permite la creación en producción con el nuevo código", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocked.generate.mockResolvedValue({
      id: "rt_test",
      prize: { id: "prize", key: "key", label: "Premio" },
      group: null,
      maxUses: 2,
      usedCount: 0,
      expiresAt: new Date("2030-11-13T05:00:00Z"),
      validFrom: new Date("2030-11-12T05:00:00Z"),
      createdAt: new Date("2030-11-10T00:00:00Z"),
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocked.generate).toHaveBeenCalledOnce();
  });
});
