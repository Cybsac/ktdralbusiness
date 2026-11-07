import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const reservation = {
    status: "approved",
    date: new Date("2099-12-01T05:00:00Z"),
    celebrantName: "Prueba Invitado",
  };
  const previous = {
    storageKey: "r/old.png",
    storageUrl: "https://storage.test/old.png",
    filePath: null,
  };
  const tx = {
    birthdayReservation: { findUniqueOrThrow: vi.fn().mockResolvedValue(reservation) },
    inviteTokenCard: { findUnique: vi.fn().mockResolvedValue(previous), upsert: vi.fn() },
    birthdayStorageCleanup: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    birthdayReservation: { findUniqueOrThrow: vi.fn().mockResolvedValue(reservation) },
    inviteTokenCard: { findUnique: vi.fn().mockResolvedValue(previous) },
    $transaction: vi.fn((fn) => fn(tx)),
  };
  return {
    tx,
    prisma,
    previous,
    upload: vi.fn(),
    generate: vi.fn(),
    tokens: vi.fn(),
    enqueue: vi.fn(),
    cleanup: vi.fn(),
    lock: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/supabase-server", () => ({
  BIRTHDAY_CARDS_BUCKET: "birthday-cards",
  uploadBufferToSupabase: mocks.upload,
}));
vi.mock("@/lib/birthdays/generateInviteCard", () => ({ generateInviteCard: mocks.generate }));
vi.mock("@/lib/birthdays/invitations", () => ({ generateInviteTokens: mocks.tokens }));
vi.mock("@/lib/birthdays/universal", () => ({
  universalInvitation: () => ({ id: "token", code: "code" }),
}));
vi.mock("@/lib/birthdays/locking", () => ({ lockBirthdayReservation: mocks.lock }));
vi.mock("@/lib/birthdays/storage-cleanup", () => ({
  enqueueBirthdayCleanup: mocks.enqueue,
  tryBirthdayStorageCleanup: mocks.cleanup,
}));
import { ensureBirthdayCards } from "@/lib/birthdays/cards";

describe("almacenamiento de tarjetas de cumpleaños", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue(Buffer.from("webp"));
    mocks.tokens.mockResolvedValue([]);
    mocks.upload.mockResolvedValue("https://storage.test/new.webp");
    mocks.tx.inviteTokenCard.upsert.mockImplementation(({ create }) => Promise.resolve(create));
  });
  it("conserva una tarjeta PNG existente sin regeneración", async () => {
    expect(await ensureBirthdayCards("r", "https://example.test")).toEqual({
      already: true,
      paths: { guest: mocks.previous.storageUrl },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("regenera en WebP y sustituye la referencia anterior sin cambiar el código", async () => {
    const result = await ensureBirthdayCards("r", "https://example.test", { regenerate: true });
    expect(mocks.generate).toHaveBeenCalledWith(
      "guest",
      "code",
      "https://example.test/b/code",
      "webp",
      "Prueba Invitado",
      expect.any(String)
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^r\/guest-.*\.webp$/),
      "image/webp",
      "birthday-cards"
    );
    expect(result.paths.guest).toBe("https://storage.test/new.webp");
    expect(mocks.enqueue).toHaveBeenCalledWith(mocks.tx, ["r/old.png"]);
  });
  it("mantiene la referencia anterior si falla la subida", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("storage failure"));
    await expect(
      ensureBirthdayCards("r", "https://example.test", { regenerate: true })
    ).rejects.toThrow("storage failure");
    expect(mocks.tx.inviteTokenCard.upsert).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalled();
  });
});
