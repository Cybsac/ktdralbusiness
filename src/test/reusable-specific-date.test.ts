import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { REUSABLE_TIMEZONE } from "@/lib/reusable-tokens/policy";
import { resolveReusableValidity } from "@/lib/reusable-tokens/request";
import { reusableAvailability } from "@/lib/reusable-tokens/validity";

const fixture = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    reusableToken: { findUnique: vi.fn(), update: vi.fn() },
    reusablePrize: { findUniqueOrThrow: vi.fn() },
    reusableTokenRedemption: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: typeof fixture.tx) => unknown) => fn(fixture.tx) },
}));
import { consumeReusableToken } from "@/lib/reusable-tokens/consumption";

const local = (iso: string) => DateTime.fromISO(iso, { zone: REUSABLE_TIMEZONE }).toJSDate();
const makeToken = (validity: ReturnType<typeof resolveReusableValidity>) => ({
  ...validity,
  disabled: false,
  maxUses: 3,
  usedCount: 0,
  prizeId: "prize",
  prize: { active: true },
  group: null,
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("vigencia reutilizable por fecha", () => {
  it("permite únicamente el día elegido", () => {
    const token = makeToken(
      resolveReusableValidity(
        { type: "specific_date", date: "2030-11-12" },
        local("2030-11-10T12:00")
      )
    );
    expect(reusableAvailability(token, local("2030-11-11T23:59"))).toBe("NOT_STARTED");
    expect(reusableAvailability(token, local("2030-11-12T00:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-12T23:59"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-13T00:00"))).toBe("TOKEN_EXPIRED");
  });
  it("permite una ventana que termina al día siguiente sin repetirse", () => {
    const token = makeToken(
      resolveReusableValidity(
        { type: "specific_date", date: "2030-11-12", startTime: "22:00", endTime: "03:00" },
        local("2030-11-10T12:00")
      )
    );
    expect(reusableAvailability(token, local("2030-11-12T21:59"))).toBe("NOT_STARTED");
    expect(reusableAvailability(token, local("2030-11-12T22:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-13T02:59"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-13T03:00"))).toBe("TOKEN_EXPIRED");
  });
  it("rechaza fechas inválidas, vencidas y ventanas incompletas o vacías", () => {
    const now = local("2030-11-12T12:00");
    expect(() =>
      resolveReusableValidity({ type: "specific_date", date: "2030-02-30" }, now)
    ).toThrow();
    expect(() =>
      resolveReusableValidity({ type: "specific_date", date: "2030-11-11" }, now)
    ).toThrow();
    expect(() =>
      resolveReusableValidity(
        { type: "specific_date", date: "2030-11-13", startTime: "20:00" },
        now
      )
    ).toThrow();
    expect(() =>
      resolveReusableValidity(
        { type: "specific_date", date: "2030-11-13", startTime: "20:00", endTime: "20:00" },
        now
      )
    ).toThrow();
  });
  it("mantiene las ventanas diarias anteriores", () => {
    const validity = resolveReusableValidity(
      { type: "time_window", startTime: "22:00", endTime: "03:00" },
      local("2030-11-10T12:00")
    );
    const token = makeToken(validity);
    expect(reusableAvailability(token, local("2030-11-11T23:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-12T23:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(token, local("2030-11-12T12:00"))).toBe("OUTSIDE_TIME_WINDOW");
  });
  it("no registra un canje antes del inicio", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(local("2030-11-11T12:00"));
    const token = makeToken(
      resolveReusableValidity({ type: "specific_date", date: "2030-11-12" }, new Date())
    );
    fixture.tx.reusableToken.findUnique.mockResolvedValue(token);
    fixture.tx.reusablePrize.findUniqueOrThrow.mockResolvedValue({ active: true });
    await expect(consumeReusableToken("token", { userId: "staff" } as never)).rejects.toMatchObject(
      { code: "NOT_STARTED" }
    );
    expect(fixture.tx.reusableToken.update).not.toHaveBeenCalled();
    expect(fixture.tx.reusableTokenRedemption.create).not.toHaveBeenCalled();
  });
});
