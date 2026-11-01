import { reservationFields } from "@/lib/birthdays/reservation-input";
import { BIRTHDAY_POLICY as P } from "@/lib/birthdays/policy";
import { birthdayManager } from "@/lib/birthdays/managementAuth";
import { birthdayDay, birthdayToday } from "@/lib/birthdays/calendar";
import { reservationCreateSchema } from "@/lib/birthdays/reservation-input";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  listReservations,
  createReservation,
  parseDateStringToLima,
  limaDateTimeToJSDate,
} from "@/lib/birthdays/service";

const ListSchema = z.object({
  status: z.enum(P.statuses).optional(),
  packId: z.string().optional(),
  dateFrom: reservationFields.date.optional(),
  dateTo: reservationFields.date.optional(),
  dateFilter: z.enum(["all", "upcoming", "past", "today"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userSession = await birthdayManager(req);
    if (!userSession) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);

    const ip = req.headers.get("x-forwarded-for") || (req as any).ip || "unknown";
    const rl = checkRateLimit(`admin:birthdays:list:${ip}`);
    if (!rl.ok)
      return apiError("RATE_LIMITED", "Too many requests", undefined, 429, {
        "Retry-After": String(rl.retryAfterSeconds),
      });

    const { searchParams } = new URL(req.url);
    const parsed = ListSchema.safeParse({
      status: searchParams.get("status") || undefined,
      packId: searchParams.get("packId") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      dateFilter: searchParams.get("dateFilter") || undefined,
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
    });
    if (!parsed.success) {
      // Extrae detalles legibles para el usuario
      const details = parsed.error.flatten();
      let userMsg = "La consulta enviada es inválida.";
      if (details && details.fieldErrors) {
        const fieldErrors = details.fieldErrors as Record<string, string[]>;
        const fields = Object.keys(fieldErrors).filter((k) => fieldErrors[k]?.length);
        if (fields.length) {
          userMsg += " Campos con error: " + fields.join(", ");
        }
      }
      return apiError("INVALID_QUERY", userMsg, details, 400);
    }

    const f = parsed.data;

    // Calcular filtros de fecha basados en dateFilter
    let effectiveDateFrom = f.dateFrom ? birthdayDay(f.dateFrom).toJSDate() : undefined;
    let effectiveDateTo = f.dateTo ? birthdayDay(f.dateTo).endOf("day").toJSDate() : undefined;
    const today = birthdayToday();
    if (f.dateFilter === "upcoming") effectiveDateFrom = today.toJSDate();
    if (f.dateFilter === "past") effectiveDateTo = today.minus({ milliseconds: 1 }).toJSDate();
    if (f.dateFilter === "today") {
      effectiveDateFrom = today.toJSDate();
      effectiveDateTo = today.endOf("day").toJSDate();
    }
    const res = await listReservations(
      {
        status: f.status,
        packId: f.packId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        search: f.search,
      },
      { page: f.page, pageSize: f.pageSize }
    );
    return apiOk(res);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Detect common production mismatch: new columns not migrated yet
    if (/column .* does not exist/i.test(msg) || /no such column/i.test(msg)) {
      return apiError(
        "DB_SCHEMA_MISMATCH",
        "Faltan migraciones en la base de datos (ejecuta prisma migrate deploy).",
        { raw: msg },
        500
      );
    }
    if (/P2021/.test(msg) || /P2022/.test(msg)) {
      return apiError(
        "DB_SCHEMA_MISMATCH",
        "Inconsistencia de esquema Prisma. Ejecuta migraciones.",
        { raw: msg },
        500
      );
    }
    return apiError("INTERNAL_ERROR", "Error interno al listar reservas", { raw: msg }, 500);
  }
}

const CreateSchema = reservationCreateSchema;

export async function POST(req: NextRequest) {
  const session = await birthdayManager(req);
  if (!session) return apiError("UNAUTHORIZED", "Sin sesión", undefined, 401);
  if (!["ADMIN", "COORDINATOR", "STAFF"].includes(session.role))
    return apiError("FORBIDDEN", "Sin acceso", undefined, 403);
  const ip = req.headers.get("x-forwarded-for") || (req as any).ip || "unknown";
  const rl = checkRateLimit(`admin:birthdays:create:${ip}`);
  if (!rl.ok)
    return apiError("RATE_LIMITED", "Too many requests", undefined, 429, {
      "Retry-After": String(rl.retryAfterSeconds),
    });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success)
      return apiError("INVALID_BODY", "Validation failed", parsed.error.flatten(), 400);
    const {
      celebrantName,
      phone,
      documento,
      email,
      date,
      timeSlot,
      packId,
      guestsPlanned,
      wantsPhotoSession,
    } = parsed.data;
    const dt = limaDateTimeToJSDate(parseDateStringToLima(date));
    if (!isFinite(dt.getTime())) return apiError("INVALID_DATE", "invalid date", undefined, 400);

    const created = await createReservation({
      celebrantName,
      phone,
      documento,
      email: email || undefined,
      date: dt,
      timeSlot,
      packId,
      guestsPlanned,
      wantsPhotoSession,
      createdBy: session?.userId,
      reservationSource: "ADMIN",
      createdByUserId: session?.userId,
      isAdmin: true,
    });

    const dto = {
      id: created.id,
      celebrantName: created.celebrantName,
      phone: created.phone,
      documento: created.documento,
      email: created.email ?? null,
      date: created.date.toISOString().slice(0, 10),
      timeSlot: created.timeSlot,
      pack: {
        id: created.pack.id,
        name: created.pack.name,
        qrCount: created.pack.qrCount,
        bottle: created.pack.bottle,
        featured: created.pack.featured,
      },
      guestsPlanned: created.guestsPlanned,
      wantsPhotoSession: created.wantsPhotoSession,
      reservationSource: created.reservationSource,
      createdByUser: created.createdByUser || null,
      status: created.status,
      tokensGeneratedAt: created.tokensGeneratedAt ? created.tokensGeneratedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    };
    return apiOk({ ok: true, reservation: dto }, 201);
  } catch (e) {
    console.error("CREATE_RESERVATION_ERROR:", e);
    // Map specific errors to user-friendly codes
    const errorMessage = String((e as any)?.message || e);
    if (errorMessage.includes("DUPLICATE_DNI_YEAR")) {
      return apiError(
        "DUPLICATE_DNI",
        "Ya existe una reserva para este DNI en el mismo año",
        undefined,
        400
      );
    }
    if (errorMessage.includes("INVALID_DNI")) {
      return apiError(
        "INVALID_DNI_FORMAT",
        "El DNI debe tener exactamente 8 dígitos",
        undefined,
        400
      );
    }
    if (errorMessage.includes("INVALID_WHATSAPP")) {
      return apiError(
        "INVALID_PHONE_FORMAT",
        "El número de WhatsApp debe tener exactamente 9 dígitos",
        undefined,
        400
      );
    }
    if (errorMessage.includes("INVALID_NAME_MIN_WORDS")) {
      return apiError(
        "INVALID_NAME",
        "El nombre debe tener al menos 2 palabras (nombre y apellido)",
        undefined,
        400
      );
    }
    if (errorMessage.includes("DATE_TOO_FAR")) {
      return apiError("DATE_TOO_FAR", "La fecha excede la anticipación permitida", undefined, 400);
    }
    if (errorMessage.includes("RESERVATION_DATE_PAST")) {
      return apiError(
        "DATE_IN_PAST",
        "La fecha de reserva no puede ser en el pasado",
        undefined,
        400
      );
    }
    return apiError(
      "CREATE_RESERVATION_ERROR",
      `Error al crear reserva: ${errorMessage}`,
      undefined,
      500
    );
  }
}
