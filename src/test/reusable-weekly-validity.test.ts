import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { REUSABLE_TIMEZONE } from "@/lib/reusable-tokens/policy";
import { reusableGenerationSchema, resolveReusableValidity } from "@/lib/reusable-tokens/request";
import { reusableAvailability } from "@/lib/reusable-tokens/validity";
import { reusableScheduleLabel } from "@/lib/reusable-tokens/weekdays";

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

const local = (value: string) => DateTime.fromISO(value, { zone: REUSABLE_TIMEZONE }).toJSDate();
const token = (weekdays: number[], startTime = "22:00", endTime = "03:00") => ({
  ...resolveReusableValidity(
    { type: "weekly_window", weekdays, startTime, endTime, expiresAt: "2030-02-01T12:00" },
    local("2030-01-01T12:00")
  ),
  disabled: false,
  maxUses: 5,
  usedCount: 0,
  prizeId: "prize",
  prize: { active: true },
  group: null,
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("vigencia semanal de QR reutilizables", () => {
  it("aplica martes y miércoles también después de medianoche", () => {
    const t = token([2, 3]);
    expect(reusableAvailability(t, local("2030-01-01T21:59"))).toBe("OUTSIDE_TIME_WINDOW");
    expect(reusableAvailability(t, local("2030-01-01T22:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(t, local("2030-01-02T02:59"))).toBe("AVAILABLE");
    expect(reusableAvailability(t, local("2030-01-02T03:00"))).toBe("OUTSIDE_TIME_WINDOW");
    expect(reusableAvailability(t, local("2030-01-02T22:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(t, local("2030-01-03T02:59"))).toBe("AVAILABLE");
    expect(reusableAvailability(t, local("2030-01-03T22:00"))).toBe("OUTSIDE_TIME_WINDOW");
    expect(reusableAvailability(t, local("2030-02-01T12:00"))).toBe("TOKEN_EXPIRED");
  });
  it("permite un día completo y ventanas que cruzan de domingo a lunes", () => {
    const allDay = token([2], "00:00", "24:00");
    expect(reusableAvailability(allDay, local("2030-01-01T00:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(allDay, local("2030-01-02T00:00"))).toBe("OUTSIDE_TIME_WINDOW");
    const sunday = token([7]);
    expect(reusableAvailability(sunday, local("2030-01-07T02:00"))).toBe("AVAILABLE");
    expect(reusableAvailability(sunday, local("2030-01-07T03:00"))).toBe("OUTSIDE_TIME_WINDOW");
    expect(reusableScheduleLabel(allDay.startTime!, allDay.endTime!, allDay.weekdays)).toContain(
      "todo el día"
    );
  });
  it("rechaza listas vacías, duplicadas y días inválidos", () => {
    const base = {
      requestKey: "12345678-1234-4234-8234-123456789abc",
      prizeId: "p",
      maxUses: 1,
      validity: {
        type: "weekly_window",
        weekdays: [2],
        startTime: "20:00",
        endTime: "03:00",
        expiresAt: "2030-02-01T12:00",
      },
    };
    for (const weekdays of [[], [2, 2], [0], [8]])
      expect(
        reusableGenerationSchema.safeParse({ ...base, validity: { ...base.validity, weekdays } })
          .success
      ).toBe(false);
    expect(reusableGenerationSchema.safeParse(base).success).toBe(true);
    expect(() =>
      resolveReusableValidity(
        {
          type: "weekly_window",
          weekdays: [4],
          startTime: "20:00",
          endTime: "23:00",
          expiresAt: "2030-01-02T12:00",
        },
        local("2030-01-01T12:00")
      )
    ).toThrow("NO_WEEKLY_OCCURRENCE");
  });
  it("rechaza canjes fuera de los días habilitados sin registrar movimientos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(local("2030-01-03T22:00"));
    fixture.tx.reusableToken.findUnique.mockResolvedValue(token([2, 3]));
    fixture.tx.reusablePrize.findUniqueOrThrow.mockResolvedValue({ active: true });
    await expect(consumeReusableToken("token", { userId: "staff" } as never)).rejects.toMatchObject(
      { code: "OUTSIDE_TIME_WINDOW" }
    );
    expect(fixture.tx.reusableToken.update).not.toHaveBeenCalled();
    expect(fixture.tx.reusableTokenRedemption.create).not.toHaveBeenCalled();
  });
});
