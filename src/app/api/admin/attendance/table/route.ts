import { Prisma } from "@prisma/client";

import { canViewAttendance } from "@/lib/attendance/access";
import {
  attendanceFilters,
  type AttendanceRaw,
  attendanceReportCte,
  attendanceRow,
} from "@/lib/attendance/report";
import { prisma } from "@/lib/prisma";
import { getPrizeOperator } from "@/lib/prize-authorization/service";
import { canEditRoster } from "@/lib/roster/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!(await canViewAttendance(req)))
    return Response.json({ ok: false, message: "Sin acceso" }, { status: 401 });
  try {
    const url = new URL(req.url),
      filter = attendanceFilters(url),
      query = attendanceReportCte(filter);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20)
    );
    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<AttendanceRaw[]>(
        Prisma.sql`${query} SELECT * FROM merged ORDER BY day DESC, "personName" ASC, "personId" ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      ),
      prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`${query} SELECT COUNT(*) AS total FROM merged`
      ),
    ]);
    const total = Number(totals[0]?.total || 0);
    const actor = await getPrizeOperator(req);
    return Response.json(
      {
        ok: true,
        rows: rows.map((row) => attendanceRow(row)),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        canEditContext: !!actor && canEditRoster(actor.role),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["INVALID_PERIOD", "INVALID_RANGE", "INVALID_FILTER"].includes(code))
      return Response.json(
        { ok: false, message: "Filtros de asistencia inválidos" },
        { status: 400 }
      );
    console.error("attendance table failed", error);
    return Response.json(
      { ok: false, message: "No se pudo cargar la asistencia" },
      { status: 500 }
    );
  }
}
