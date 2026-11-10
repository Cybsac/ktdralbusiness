import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { birthdayAdministrator } from "@/lib/birthdays/managementAuth";
import { prisma } from "@/lib/prisma";
import { birthdayDay } from "@/lib/birthdays/calendar";
import { birthdayCardNameField, reservationFields } from "@/lib/birthdays/reservation-input";

const schema = z.object({
  organizerDni: reservationFields.documento,
  celebrantName: birthdayCardNameField,
  date: reservationFields.date,
});
const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export async function POST(req: NextRequest) {
  if (!(await birthdayAdministrator(req)))
    return apiError("UNAUTHORIZED", undefined, undefined, 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BODY", "Revisa los datos de la reserva.", undefined, 400);
  const day = birthdayDay(parsed.data.date);
  const configured = Number(process.env.BIRTHDAY_SURPRISE_DUPLICATE_WINDOW_DAYS);
  const windowDays =
    Number.isInteger(configured) && configured >= 0 && configured <= 365 ? configured : 7;
  const candidates = await prisma.birthdayReservation.findMany({
    where: {
      isSurprise: true,
      organizerDni: parsed.data.organizerDni,
      status: { not: "canceled" },
      date: {
        gte: day.minus({ days: windowDays }).startOf("day").toJSDate(),
        lte: day.plus({ days: windowDays }).endOf("day").toJSDate(),
      },
    },
    select: { celebrantName: true },
  });
  const requested = normalize(parsed.data.celebrantName);
  const possibleDuplicate = candidates.some(({ celebrantName }) => {
    const candidate = normalize(celebrantName);
    return requested.length > 0 && requested[0] === candidate[0];
  });
  return apiOk({ possibleDuplicate });
}
