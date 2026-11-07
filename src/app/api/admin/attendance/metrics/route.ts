import { Prisma } from "@prisma/client";

import { canViewAttendance } from "@/lib/attendance/access";
import {
  attendanceFilters,
  type AttendanceRaw,
  attendanceReportCte,
  attendanceRow,
} from "@/lib/attendance/report";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!(await canViewAttendance(req)))
    return Response.json({ ok: false, message: "Sin acceso" }, { status: 401 });
  try {
    const filter = attendanceFilters(new URL(req.url));
    const rows = (
      await prisma.$queryRaw<AttendanceRaw[]>(
        Prisma.sql`${attendanceReportCte(filter)} SELECT * FROM merged`
      )
    ).map((row) => attendanceRow(row));
    const marked = rows.filter((row) => !!row.firstIn);
    const complete = marked.filter((row) => row.attendanceState === "COMPLETED");
    const missingExit = marked.filter((row) => row.attendanceState === "MISSING_EXIT");
    const completedOrClosed = marked.filter(
      (row) => row.isClosed || row.attendanceState === "COMPLETED"
    );
    const schedule = rows.filter((row) => row.scheduled);
    const missing = schedule.filter(
      (row) =>
        row.attendanceState === "ABSENT" || (row.attendanceState === "MISSING_ENTRY" && row.isPast)
    );
    const durations = complete.filter((row) => row.durationMin !== null);
    const summary = {
      totalShifts: marked.length,
      completeShifts: complete.length,
      incompleteShifts: missingExit.length,
      completionRate: completedOrClosed.length
        ? (complete.length / completedOrClosed.length) * 100
        : 0,
      avgDurationMin: durations.length
        ? durations.reduce((sum, row) => sum + (row.durationMin || 0), 0) / durations.length
        : 0,
      totalUniquePeople: new Set(marked.map((row) => row.personId)).size,
      totalBusinessDays: new Set(rows.map((row) => row.day)).size,
      scheduledShifts: schedule.length,
      pending: schedule.filter(
        (row) => row.attendanceState === "PENDING" || row.attendanceState === "SCHEDULED"
      ).length,
      missingEntry: missing.length,
      unscheduled: marked.filter((row) => !row.scheduled).length,
    };
    const group = (items: typeof rows) => {
      const map = new Map<string, typeof rows>();
      for (const item of items) {
        const current = map.get(item.personId);
        if (current) current.push(item);
        else map.set(item.personId, [item]);
      }
      return [...map.values()];
    };
    const attendedByPerson = new Map<string, number>();
    for (const item of schedule)
      if (item.firstIn)
        attendedByPerson.set(item.personId, (attendedByPerson.get(item.personId) || 0) + 1);
    const topAbsences = group(missing)
      .map((items) => ({
        personCode: items[0].personCode,
        personName: items[0].personName,
        daysMissed: items.length,
        daysAttended: attendedByPerson.get(items[0].personId) || 0,
      }))
      .sort((a, b) => b.daysMissed - a.daysMissed)
      .slice(0, 10);
    const topIncomplete = group(missingExit)
      .map((items) => ({
        personCode: items[0].personCode,
        personName: items[0].personName,
        incompleteCount: items.length,
      }))
      .sort((a, b) => b.incompleteCount - a.incompleteCount)
      .slice(0, 10);
    const topComplete = group(complete)
      .map((items) => ({
        personCode: items[0].personCode,
        personName: items[0].personName,
        completeCount: items.length,
      }))
      .sort((a, b) => b.completeCount - a.completeCount)
      .slice(0, 10);
    const topDuration = group(durations)
      .map((items) => {
        const totalDurationMin = items.reduce((sum, row) => sum + (row.durationMin || 0), 0);
        return {
          personCode: items[0].personCode,
          personName: items[0].personName,
          totalDurationMin,
          avgDurationMin: totalDurationMin / items.length,
        };
      })
      .sort((a, b) => b.totalDurationMin - a.totalDurationMin)
      .slice(0, 10);
    return Response.json(
      { ok: true, summary, topAbsences, topIncomplete, topComplete, topDuration },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["INVALID_PERIOD", "INVALID_RANGE", "INVALID_FILTER"].includes(code))
      return Response.json(
        { ok: false, message: "Filtros de asistencia inválidos" },
        { status: 400 }
      );
    console.error("attendance metrics failed", error);
    return Response.json(
      { ok: false, message: "No se pudieron cargar las métricas de asistencia" },
      { status: 500 }
    );
  }
}
