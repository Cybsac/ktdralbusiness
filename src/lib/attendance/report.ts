import { Prisma } from "@prisma/client";

import { currentBusinessDay } from "@/lib/attendanceDay";
import { rangeBusinessDays } from "@/lib/date";
import { rosterDaySchema } from "@/lib/roster/input";
import type { Period } from "@/types/metrics";

const periods = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "custom",
] as const;
export function attendanceFilters(url: URL) {
  const params = url.searchParams;
  const period = params.get("period") || "today";
  if (!(periods as readonly string[]).includes(period)) throw new Error("INVALID_PERIOD");
  const from = params.get("startDate"),
    to = params.get("endDate");
  if (
    period === "custom" &&
    (!rosterDaySchema.safeParse(from).success ||
      !rosterDaySchema.safeParse(to).success ||
      from! > to!)
  )
    throw new Error("INVALID_RANGE");
  const { startDay, endDay } = rangeBusinessDays(
    period as Period,
    from || undefined,
    to || undefined
  );
  const area = params.get("area")?.trim() || "",
    person = params.get("person")?.trim() || "";
  if (area.length > 100 || person.length > 150) throw new Error("INVALID_FILTER");
  return { startDay, endDay, area, person };
}
export type AttendanceFilters = ReturnType<typeof attendanceFilters>;
export function attendanceReportCte(f: AttendanceFilters) {
  const filters = Prisma.sql`${f.area ? Prisma.sql`AND p."area" = ${f.area}` : Prisma.empty} ${f.person ? (f.person.startsWith("id:") ? Prisma.sql`AND p."id" = ${f.person.slice(3)}` : Prisma.sql`AND p."code" = ${f.person}`) : Prisma.empty}`;
  return Prisma.sql`WITH scans AS (
    SELECT s."personId", s."businessDay" AS day,
      MIN(s."scannedAt") FILTER (WHERE s."type" = 'IN') AS "firstIn",
      MAX(s."scannedAt") FILTER (WHERE s."type" = 'IN') AS "lastIn",
      (ARRAY_AGG(s.id ORDER BY s."scannedAt" DESC, s.id DESC) FILTER (WHERE s."type" = 'IN'))[1] AS "lastInId",
      MAX(s."scannedAt") FILTER (WHERE s."type" = 'OUT') AS "lastOut",
      (ARRAY_AGG(s."type" ORDER BY s."scannedAt" DESC, s.id DESC))[1] AS "lastType"
    FROM "Scan" s WHERE s."businessDay" BETWEEN ${f.startDay} AND ${f.endDay}
    GROUP BY s."personId", s."businessDay"
  ), tasks AS (
    SELECT t."personId", t.day, COUNT(*) FILTER (WHERE t.done) AS "doneCount", COUNT(*) AS "totalCount"
    FROM "PersonTaskStatus" t WHERE t.day BETWEEN ${f.startDay} AND ${f.endDay}
    GROUP BY t."personId", t.day
  ), scheduled AS (
    SELECT a."personId", a."businessDay" AS day, ARRAY_AGG(DISTINCT r.name ORDER BY r.name) AS roles
    FROM "RosterAssignment" a JOIN "RosterRole" r ON r.id = a."roleId"
    WHERE a.active = true AND a."businessDay" BETWEEN ${f.startDay} AND ${f.endDay}
    GROUP BY a."personId", a."businessDay"
  ), days AS (
    SELECT "personId", day FROM scans UNION SELECT "personId", day FROM tasks UNION SELECT "personId", day FROM scheduled
    UNION SELECT "personId", "businessDay" AS day FROM "AttendanceContext" WHERE "businessDay" BETWEEN ${f.startDay} AND ${f.endDay}
  ), merged AS (
    SELECT p.id AS "personId", u.id AS "userId", p.code AS "personCode", p.name AS "personName", p.area,
      d.day, sc."firstIn", sc."lastIn", sc."lastInId", sc."lastOut", sc."lastType", sch.roles, ac.reason AS "contextReason", de."closedAt",
      aj.reason AS "justificationReason", aj."updatedAt" AS "justificationAt", COALESCE(jp.name, ju.username) AS "justificationBy",
      COALESCE(t."doneCount",0) AS "doneCount", COALESCE(t."totalCount",0) AS "totalCount"
    FROM days d JOIN "Person" p ON p.id = d."personId"
      LEFT JOIN "User" u ON u."personId" = p.id
      LEFT JOIN scans sc ON sc."personId" = d."personId" AND sc.day = d.day
      LEFT JOIN tasks t ON t."personId" = d."personId" AND t.day = d.day
      LEFT JOIN scheduled sch ON sch."personId" = d."personId" AND sch.day = d.day
      LEFT JOIN "AttendanceContext" ac ON ac."personId" = d."personId" AND ac."businessDay" = d.day
      LEFT JOIN "DailyEvaluation" de ON de."businessDay" = d.day
      LEFT JOIN "AttendanceJustification" aj ON aj."personId" = d."personId" AND aj."businessDay" = d.day AND aj.active = true AND aj."entryScanId" = sc."lastInId" AND sc."lastType" = 'IN'
      LEFT JOIN "User" ju ON ju.id = aj."updatedBy"
      LEFT JOIN "Person" jp ON jp.id = ju."personId"
    WHERE true ${filters}
  )`;
}
export type AttendanceRaw = {
  personId: string;
  userId: string | null;
  personCode: string;
  personName: string;
  area: string | null;
  day: string;
  firstIn: Date | null;
  lastIn: Date | null;
  lastInId?: string | null;
  lastOut: Date | null;
  lastType: string | null;
  roles: string[] | null;
  contextReason: string | null;
  closedAt?: Date | null;
  justificationReason?: string | null;
  justificationAt?: Date | null;
  justificationBy?: string | null;
  doneCount: bigint | number;
  totalCount: bigint | number;
};
export function attendanceRow(r: AttendanceRaw, today = currentBusinessDay()) {
  const scheduled = !!r.roles,
    hasEntry = !!r.firstIn,
    hasExit = !!r.lastOut;
  const isPast = r.day < today,
    isFuture = r.day > today;
  const isClosed = isPast || !!r.closedAt;
  const missingExit = hasEntry && r.lastType === "IN";
  const missingEntry = !hasEntry && hasExit;
  const unmarkedScheduled = scheduled && !hasEntry && !hasExit;
  const state = missingEntry
    ? scheduled && isClosed
      ? "ABSENT"
      : "MISSING_ENTRY"
    : missingExit
      ? isClosed
        ? "MISSING_EXIT"
        : "IN_PROGRESS"
      : hasEntry && hasExit
        ? "COMPLETED"
        : unmarkedScheduled
          ? isClosed
            ? "ABSENT"
            : isFuture
              ? "SCHEDULED"
              : "PENDING"
          : "NO_MARKS";
  const durationMin =
    state === "COMPLETED" && r.firstIn && r.lastOut && r.lastOut > r.firstIn
      ? (r.lastOut.getTime() - r.firstIn.getTime()) / 60000
      : null;
  const doneCount = Number(r.doneCount || 0),
    totalCount = Number(r.totalCount || 0);
  return {
    day: r.day,
    personId: r.personId,
    userId: r.userId,
    personCode: r.personCode,
    personName: r.personName,
    area: r.area,
    firstIn: r.firstIn?.toISOString() || null,
    lastOut: r.lastOut?.toISOString() || null,
    durationMin,
    doneCount,
    totalCount,
    completionPct: totalCount ? (100 * doneCount) / totalCount : 0,
    scheduled,
    roles: r.roles || [],
    contextReason: r.contextReason,
    justification:
      missingExit && r.justificationReason
        ? {
            reason: r.justificationReason,
            at: r.justificationAt?.toISOString() || null,
            by: r.justificationBy || "Usuario",
          }
        : null,
    attendanceState: state,
    status: state,
    incomplete: missingExit || missingEntry,
    isPast,
    isClosed,
  };
}
