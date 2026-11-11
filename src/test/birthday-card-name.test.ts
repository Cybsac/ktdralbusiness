import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findReservation: vi.fn(), findPack: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/birthdays/locking", () => ({ lockBirthdayDocument: vi.fn(), lockBirthdaySlot: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({
  birthdayReservation: { findFirst: mocks.findReservation, create: mocks.create },
  birthdayPack: { findFirst: mocks.findPack },
}) } }));
import { createReservation } from "@/lib/birthdays/creation";

describe("nombre editable de la tarjeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findReservation.mockResolvedValue(null);
    mocks.findPack.mockResolvedValue({ id: "pack", active: true, priceSoles: 10, qrCount: 1, bottle: null });
    mocks.create.mockImplementation(async ({ data }) => ({ ...data, pack: { bottle: null }, date: data.date }));
  });
  it("guarda el nombre de la tarjeta sin modificar el nombre verificado", async () => {
    await createReservation({ celebrantName: "Ana Ejemplo", cardName: "Anita", phone: "912345678", documento: "12345678", birthDate: "2000-01-01", date: new Date("2030-01-01T05:00:00Z"), timeSlot: "20:00", packId: "pack", guestsPlanned: 1, isAdmin: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celebrantName: "Ana Ejemplo", cardName: "Anita", documento: "12345678" }) }));
  });
});
