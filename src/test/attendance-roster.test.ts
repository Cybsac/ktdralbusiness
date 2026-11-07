import { describe, expect, it } from "vitest";

import { attendanceFilters, type AttendanceRaw, attendanceRow } from "@/lib/attendance/report";

const base: AttendanceRaw = {
  personId: "p",
  userId: "u",
  personCode: "001",
  personName: "Ana",
  area: "Barra",
  day: "2026-11-06",
  firstIn: null,
  lastIn: null,
  lastOut: null,
  lastType: null,
  roles: ["Barra", "Caja"],
  contextReason: null,
  doneCount: 0,
  totalCount: 0,
};
const mark = (value: string) => new Date(value);
describe("programación y asistencia", () => {
  it("distingue jornada futura, pendiente y jornada cerrada sin entrada", () => {
    expect(attendanceRow(base, "2026-11-05").attendanceState).toBe("SCHEDULED");
    expect(attendanceRow(base, "2026-11-06").attendanceState).toBe("PENDING");
    const result = attendanceRow(base, "2026-11-07");
    expect(result.attendanceState).toBe("ABSENT");
    expect(result.roles).toEqual(["Barra", "Caja"]);
  });
  it("marca falta si se cierra la jornada actual sin entrada", () => {
    const result = attendanceRow(
      { ...base, closedAt: new Date("2026-11-06T23:00:00Z") },
      "2026-11-06"
    );
    expect(result.attendanceState).toBe("ABSENT");
  });
  it("mantiene incompleta la jornada justificada y conserva el comentario", () => {
    const entry = mark("2026-11-07T01:00:00Z");
    const result = attendanceRow(
      {
        ...base,
        firstIn: entry,
        lastIn: entry,
        lastType: "IN",
        justificationReason: "Cierre sin marca",
        justificationBy: "Coordinación",
      },
      "2026-11-07"
    );
    expect(result.attendanceState).toBe("MISSING_EXIT");
    expect(result.justification).toMatchObject({ reason: "Cierre sin marca", by: "Coordinación" });
    expect(result.lastOut).toBeNull();
  });
  it("separa jornada en curso, salida faltante y jornada completa", () => {
    const entry = mark("2026-11-07T01:00:00Z"),
      exit = mark("2026-11-07T05:00:00Z");
    const open = { ...base, firstIn: entry, lastIn: entry, lastType: "IN" };
    expect(attendanceRow(open, "2026-11-06").attendanceState).toBe("IN_PROGRESS");
    expect(attendanceRow(open, "2026-11-07").attendanceState).toBe("MISSING_EXIT");
    const done = attendanceRow({ ...open, lastOut: exit, lastType: "OUT" }, "2026-11-07");
    expect(done.attendanceState).toBe("COMPLETED");
    expect(done.durationMin).toBe(240);
  });
  it("no inventa programación y detecta entrada faltante", () => {
    const result = attendanceRow(
      {
        ...base,
        roles: null,
        lastOut: mark("2026-11-07T05:00:00Z"),
        lastType: "OUT",
        contextReason: "Pasantía",
      },
      "2026-11-07"
    );
    expect(result.scheduled).toBe(false);
    expect(result.contextReason).toBe("Pasantía");
    expect(result.attendanceState).toBe("MISSING_ENTRY");
  });
  it("detecta una nueva entrada sin salida aunque exista una salida anterior", () => {
    const result = attendanceRow(
      {
        ...base,
        firstIn: mark("2026-11-07T01:00:00Z"),
        lastIn: mark("2026-11-07T06:00:00Z"),
        lastOut: mark("2026-11-07T05:00:00Z"),
        lastType: "IN",
      },
      "2026-11-07"
    );
    expect(result.attendanceState).toBe("MISSING_EXIT");
    expect(result.durationMin).toBeNull();
  });
  it("valida filtros de período y fechas", () => {
    expect(() =>
      attendanceFilters(
        new URL("http://localhost?period=custom&startDate=2026-02-30&endDate=2026-03-01")
      )
    ).toThrow("INVALID_RANGE");
    expect(() => attendanceFilters(new URL("http://localhost?period=otro"))).toThrow(
      "INVALID_PERIOD"
    );
  });
});
