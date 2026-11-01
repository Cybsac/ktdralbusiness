import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { BIRTHDAY_POLICY as P } from "@/lib/birthdays/policy";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!(await birthdayAdministrator(req)))
    return NextResponse.json({ message: "Sin acceso" }, { status: 401 });
  try {
    const [configuration, referrers, counts, months] = await Promise.all([
      prisma.systemConfig.findUnique({
        where: { id: 1 },
        select: { birthdayReferrerCommissionAmount: true },
      }),
      prisma.birthdayReferrer.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, slug: true, active: true, approvalStatus: true },
      }),
      prisma.birthdayReservation.groupBy({
        by: ["referrerId", "status"],
        where: { referrerId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.$queryRaw<
        Array<{ referrerId: string; month: string; count: bigint }>
      >`SELECT "referrerId",to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${P.timezone},'YYYY-MM') AS month,count(*) AS count FROM "BirthdayReservation" WHERE "referrerId" IS NOT NULL GROUP BY "referrerId",month ORDER BY month`,
    ]);
    const commissionAmount = Number(
      configuration?.birthdayReferrerCommissionAmount ?? P.defaultReferralCommission
    );
    const rows = referrers.map((referrer) => {
      const own = counts.filter((row) => row.referrerId === referrer.id);
      const totalReservations = own.reduce((sum, row) => sum + row._count._all, 0);
      const completedReservations = own
        .filter((row) => row.status === "completed")
        .reduce((sum, row) => sum + row._count._all, 0);
      const latest = own
        .flatMap((row) => (row._max.createdAt ? [row._max.createdAt] : []))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        ...referrer,
        totalReservations,
        completedReservations,
        virtualEarnings: totalReservations * commissionAmount,
        realEarnings: completedReservations * commissionAmount,
        conversionRate: totalReservations ? (completedReservations / totalReservations) * 100 : 0,
        lastReservation: latest?.toISOString() || null,
        reservationsByMonth: months
          .filter((row) => row.referrerId === referrer.id)
          .map((row) => ({ month: row.month, count: Number(row.count) })),
      };
    });
    const totalReservations = rows.reduce((sum, row) => sum + row.totalReservations, 0),
      totalCompletedReservations = rows.reduce((sum, row) => sum + row.completedReservations, 0);
    return NextResponse.json(
      {
        referrerStats: rows,
        overallStats: {
          totalReferrers: referrers.length,
          activeReferrers: referrers.filter((row) => row.active).length,
          totalReservations,
          totalCompletedReservations,
          totalVirtualEarnings: rows.reduce((sum, row) => sum + row.virtualEarnings, 0),
          totalRealEarnings: rows.reduce((sum, row) => sum + row.realEarnings, 0),
          averageConversionRate: rows.length
            ? rows.reduce((sum, row) => sum + row.conversionRate, 0) / rows.length
            : 0,
          commissionAmount,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Birthday referral metrics failed", error);
    return NextResponse.json({ message: "No se pudo consultar el resumen" }, { status: 500 });
  }
}
