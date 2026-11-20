import { prisma } from "@/lib/prisma";
import type { WelcomePlayerPrize } from "./types";
import type { WelcomePlayersSpinResult } from "./engine";
import { businessDayWindowUtc, currentBusinessDay } from "@/lib/attendanceDay";

type SpinRecord = {
  id: string;
  prizeId: string;
  prizeLabel: string;
  prizeColor: string;
  createdAt: Date;
};

export async function recordWelcomePlayersSpin(result: WelcomePlayersSpinResult) {
  await (prisma as any).welcomePlayersSpin.create({
    data: {
      id: result.spinId,
      prizeId: result.prize.id,
      prizeLabel: result.prize.label,
      prizeColor: result.prize.color,
      prizeOrder: result.prize.order,
      prizeWeight: result.prize.weight,
      rotation: result.rotation,
      turns: result.turns,
      createdAt: new Date(result.createdAt),
    },
  });
}

export async function getWelcomePlayersSpin(id: string) {
  const record = await (prisma as any).welcomePlayersSpin.findUnique({ where: { id } });
  if (!record) return null;
  return {
    spinId: record.id,
    prize: { id: record.prizeId, label: record.prizeLabel, color: record.prizeColor, status: "active" as const, weight: record.prizeWeight, order: record.prizeOrder },
    prizeIndex: -1,
    turns: record.turns,
    rotation: record.rotation,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getWelcomePlayersState(prizes: WelcomePlayerPrize[], day = currentBusinessDay()) {
  const active = prizes.filter((prize) => prize.status === "active").sort((a, b) => a.order - b.order);
  const { startUtc, endUtc } = businessDayWindowUtc(day);
  const where = { createdAt: { gte: startUtc, lt: endUtc } };
  const [totalSpins, grouped, records] = await Promise.all([
    (prisma as any).welcomePlayersSpin.count({ where }),
    (prisma as any).welcomePlayersSpin.groupBy({
      where,
      by: ["prizeId", "prizeLabel", "prizeColor"],
      _count: { _all: true },
    }),
    (prisma as any).welcomePlayersSpin.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        prizeId: true,
        prizeLabel: true,
        prizeColor: true,
        createdAt: true,
      },
    }),
  ]) as [number, Array<{ prizeId: string; prizeLabel: string; prizeColor: string; _count: { _all: number } }>, SpinRecord[]];

  const counts = new Map<string, { prizeId: string; label: string; color: string; count: number }>();
  for (const row of grouped) {
    const existing = counts.get(row.prizeId);
    if (existing) existing.count += row._count._all;
    else {
      const recent = records.find((record) => record.prizeId === row.prizeId);
      const configured = prizes.find((prize) => prize.id === row.prizeId);
      counts.set(row.prizeId, { prizeId: row.prizeId, label: recent?.prizeLabel || configured?.label || row.prizeLabel, color: recent?.prizeColor || configured?.color || row.prizeColor, count: row._count._all });
    }
  }
  for (const prize of active) if (!counts.has(prize.id)) counts.set(prize.id, { prizeId: prize.id, label: prize.label, color: prize.color, count: 0 });
  const prizeCounts = [...counts.values()];
  const topPrize = [...prizeCounts].filter((item) => item.count > 0).sort((a, b) => b.count - a.count)[0] || null;
  const lastPrize = records[0]
    ? {
        prizeId: records[0].prizeId,
        label: records[0].prizeLabel,
        color: records[0].prizeColor,
        createdAt: records[0].createdAt.toISOString(),
      }
    : null;

  return {
    businessDay: day,
    totalSpins,
    activePrizes: active.length,
    topPrize,
    lastPrize,
    prizeCounts,
    recentSpins: records.slice(0, 20).map((record) => ({
      spinId: record.id,
      prizeId: record.prizeId,
      label: record.prizeLabel,
      color: record.prizeColor,
      createdAt: record.createdAt.toISOString(),
    })),
  };
}
