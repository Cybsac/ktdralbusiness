import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ executeRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $executeRaw: mocks.executeRaw } }));

import { acceptNews } from "@/lib/internal-news/assignments";
import { CURRENT_REGULATION } from "@/lib/regulations/constants";

describe("aceptación del reglamento base", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([null, undefined])("acepta sin asignación (%s) y conserva la sesión", async (assignmentId) => {
    await expect(acceptNews("user-id", { version: CURRENT_REGULATION.version, assignmentId })).resolves.toEqual({ completed: true });
    const [sql, ...values] = mocks.executeRaw.mock.calls[0];
    expect(sql.join("?")).toContain('"commitmentVersionAccepted"');
    expect(sql.join("?")).not.toContain('"updatedAt"');
    expect(values).toContain("user-id");
  });

  it("no registra la aceptación de una versión distinta", async () => {
    await expect(acceptNews("user-id", { version: CURRENT_REGULATION.version + 1, assignmentId: null })).rejects.toMatchObject({ code: "INVALID_VERSION" });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
