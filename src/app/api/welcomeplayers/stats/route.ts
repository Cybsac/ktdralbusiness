import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/apiError";
import { DateTime } from "luxon";
import { currentBusinessDay } from "@/lib/attendanceDay";
import { listWelcomePlayersPrizes } from "@/lib/welcomeplayers/repository";
import { getWelcomePlayersState } from "@/lib/welcomeplayers/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const day = new URL(req.url).searchParams.get("day") || currentBusinessDay();
  const parsedDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? DateTime.fromISO(day, { zone: "utc" }) : null;
  if (!parsedDay?.isValid || parsedDay.toISODate() !== day) return apiError("INVALID_DAY", "Selecciona una jornada válida.", undefined, 400);
  const prizes = await listWelcomePlayersPrizes();
  const stats = await getWelcomePlayersState(prizes, day);
  return apiOk({
    ...stats,
    generatedAt: new Date().toISOString(),
  });
}
