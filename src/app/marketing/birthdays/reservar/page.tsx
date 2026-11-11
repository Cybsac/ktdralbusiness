"use client";
export const dynamic = "force-dynamic";
import { Camera } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useState } from "react";

import { BirthdayIdentityLookup } from "@/components/BirthdayIdentityLookup";
import { ReservationProgress } from "@/components/birthdays/ReservationProgress";
import { BottleIceModal } from "@/components/BottleIceModal";
import { ReservationMessageModal } from "@/components/ReservationMessageModal";
import { birthdayDay, birthdayToday } from "@/lib/birthdays/calendar";
import { birthdayCardName } from "@/lib/birthdays/card-name";
import { suggestedCelebration } from "@/lib/birthdays/celebration";
import { BIRTHDAY_POLICY } from "@/lib/birthdays/policy";
import { birthdayCardNameField, reservationFields } from "@/lib/birthdays/reservation-input";
import { getServerErrorDetails, getValidationErrorDetails } from "@/lib/reservation-errors";

function ReservarCumplePageInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Tipo para packs
  type PackType = {
    id: string;
    name: string;
    qrCount: number;
    bottle?: string | null;
    perks?: string[];
  };

  // Packs
  const [packs, setPacks] = useState<PackType[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [packsAttempt, setPacksAttempt] = useState(0);
  const [packsError, setPacksError] = useState("");

  // Form
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cardName, setCardName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [documento, setDocumento] = useState("");
  const [lookupDocument, setLookupDocument] = useState("");
  const [identityProof, setIdentityProof] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [date, setDate] = useState(() => birthdayToday().toISODate() || "");
  const [timeSlot, setTimeSlot] = useState("");
  const [packId, setPackId] = useState<string>("");
  const [wantsPhotoSession, setWantsPhotoSession] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const [phase, setPhase] = useState<"idle" | "creating" | "generating">("idle");
  const [referrerId, setReferrerId] = useState<string | null>(null);
  const [referrerLoading, setReferrerLoading] = useState(false);
  const [referrerError, setReferrerError] = useState("");
  const [slots, setSlots] = useState<{ slot: string; remaining: number }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [slotsAttempt, setSlotsAttempt] = useState(0);

  // Modal de hielo/botella
  const [showBottleIceModal, setShowBottleIceModal] = useState(false);
  const [reservationData, setReservationData] = useState<{
    id: string;
    clientSecret: string;
  } | null>(null);

  // Modal
  const [modalMessage, setModalMessage] = useState<{
    field: "name" | "whatsapp" | "documento" | "date" | "pack" | "general";
    type: "error" | "warning" | "info";
    title: string;
    message: string;
    suggestions: string[];
    isOpen: boolean;
  } | null>(null);

  // Preselección por query
  useEffect(() => {
    const q = params?.get("packId") || "";
    if (!q || !packs.length) return;
    const byId = packs.find((p) => p.id === q);
    if (byId) {
      setPackId(byId.id);
      return;
    }
  }, [params, packs]);

  // Referrer
  useEffect(() => {
    const ref = params?.get("ref");
    if (ref && ref.trim()) {
      const controller = new AbortController();
      setReferrerLoading(true);
      setReferrerError("");
      setReferrerId(null);
      fetch(`/api/birthdays/referrers/${encodeURIComponent(ref)}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.referrer?.active) throw new Error();
          return data.referrer.id as string;
        })
        .then(setReferrerId)
        .catch(() => {
          if (!controller.signal.aborted)
            setReferrerError("No se pudo verificar el enlace de invitación.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setReferrerLoading(false);
        });
      return () => controller.abort();
    } else {
      setReferrerId(null);
      setReferrerError("");
      setReferrerLoading(false);
    }
  }, [params]);

  // Cargar packs
  useEffect(() => {
    (async () => {
      setLoadingPacks(true);
      setPacksError("");
      try {
        const res = await fetch("/api/birthdays/packs?scope=public");
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.packs) throw new Error(j?.message || "Error al cargar packs");
        // Deduplicar por ID para evitar duplicados en la UI
        const packMap = new Map<string, PackType>();
        j.packs.forEach((p: any) => packMap.set(p.id, p as PackType));
        const uniquePacks: PackType[] = Array.from(packMap.values());
        setPacks(uniquePacks);
      } catch (e: any) {
        setPacksError("No se pudieron cargar los packs. Intenta nuevamente.");
      } finally {
        setLoadingPacks(false);
      }
    })();
  }, [packsAttempt]);

  useEffect(() => {
    if (!date || !birthdayDay(date).isValid) {
      setSlots([]);
      setTimeSlot("");
      setSlotsLoading(false);
      return;
    }
    const controller = new AbortController();
    setSlotsLoading(true);
    setSlotsError("");
    setSlots([]);
    fetch(`/api/birthdays/slots?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.slots))
          throw new Error(data?.message || "No se pudieron consultar los horarios.");
        return data.slots as { slot: string; remaining: number }[];
      })
      .then((items) => {
        setSlots(items);
        setTimeSlot((current) =>
          items.some((item) => item.slot === current && item.remaining > 0)
            ? current
            : items.find((item) => item.remaining > 0)?.slot || ""
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSlotsError("No se pudieron consultar los horarios.");
          setTimeSlot("");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [date, slotsAttempt]);

  const selectedPack = useMemo(() => packs.find((p) => p.id === packId) || null, [packs, packId]);
  const nextAge = useMemo(() => {
    const birth = birthdayDay(birthDate);
    const today = birthdayToday();
    if (!birth.isValid || birth > today) return null;
    const thisBirthday = birth.set({ year: today.year });
    return today.year - birth.year + (thisBirthday < today ? 1 : 0);
  }, [birthDate]);

  function nextStep() {
    let error = "";
    if (step === 0) {
      if (!reservationFields.documento.safeParse(documento.trim()).success)
        error = "Ingresa un DNI válido de 8 dígitos.";
      else if (!lookupDocument || lookupDocument !== documento || !name.trim() || !identityProof)
        error = "Completa los datos del DNI para continuar.";
      else if (!birthDate || !reservationFields.birthDate.safeParse(birthDate).success)
        error =
          "No pudimos obtener la fecha de nacimiento. Contacta al equipo para realizar tu reserva.";
      else if (!birthdayCardNameField.safeParse(cardName).success)
        error = "Ingresa un solo nombre para la tarjeta.";
      else if (!reservationFields.phone.safeParse(whatsapp.trim()).success)
        error = "Ingresa un WhatsApp válido de 9 dígitos.";
    } else if (step === 1) {
      if (
        !reservationFields.date.safeParse(date).success ||
        birthdayDay(date) < birthdayToday() ||
        birthdayDay(date) > birthdayToday().plus({ days: BIRTHDAY_POLICY.publicBookingDays })
      )
        error = `Elige una fecha dentro de los próximos ${BIRTHDAY_POLICY.publicBookingDays} días.`;
      else if (BIRTHDAY_POLICY.closedWeekdays.includes(birthdayDay(date).weekday))
        error = "No atendemos en esa fecha. Elige otro día.";
      else if (!timeSlot) error = "Selecciona un horario disponible.";
    } else if (step === 2 && (!selectedPack || selectedPack.qrCount < 1))
      error = "Selecciona un pack para continuar.";
    else if (step === 2 && wantsPhotoSession === null)
      error = "Elige si deseas una sesión de fotos.";
    setStepError(error);
    if (!error) {
      setStep((value) => Math.min(value + 1, 3));
      document.getElementById("form")?.scrollIntoView({ block: "start" });
    }
  }

  // Validación
  function validateBasic(): string | null {
    if (!name.trim() || lookupDocument !== documento || !identityProof)
      return "Completa los datos del DNI para continuar";
    if (!birthdayCardNameField.safeParse(cardName).success)
      return "Ingresa un solo nombre para la tarjeta";
    if (name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres";
    if (name.trim().split(/\s+/).filter(Boolean).length < 2)
      return "Ingresa nombre y apellido (mínimo 2 palabras)";
    if (!whatsapp.trim()) return "WhatsApp es obligatorio";
    if (!reservationFields.phone.safeParse(whatsapp.trim()).success)
      return "WhatsApp debe tener exactamente 9 dígitos (ej: 912345678)";
    if (!documento.trim()) return "Documento es obligatorio";
    // Alinear con backend: DNI exacto 8 dígitos
    if (!reservationFields.documento.safeParse(documento.trim()).success)
      return "Documento debe tener 8 dígitos (DNI)";
    if (!reservationFields.birthDate.safeParse(birthDate).success || !birthDate)
      return "No pudimos obtener la fecha de nacimiento. Contacta al equipo para realizar tu reserva.";
    if (!reservationFields.date.safeParse(date).success) return "Selecciona una fecha válida";
    if (
      birthdayDay(date) < birthdayToday() ||
      birthdayDay(date) > birthdayToday().plus({ days: BIRTHDAY_POLICY.publicBookingDays })
    )
      return `La fecha debe estar dentro de los próximos ${BIRTHDAY_POLICY.publicBookingDays} días`;
    if (BIRTHDAY_POLICY.closedWeekdays.includes(birthdayDay(date).weekday))
      return "No atendemos en la fecha seleccionada. Elige otro día.";
    if (!timeSlot) return "Selecciona un horario";
    if (!selectedPack || selectedPack.qrCount < 1) return "Selecciona un Pack";
    if (wantsPhotoSession === null) return "Elige si deseas una sesión de fotos";
    return null;
  }

  function runValidation(): boolean {
    const msg = validateBasic();
    if (msg) {
      const details = getValidationErrorDetails(msg);
      setModalMessage(
        details
          ? { ...details, isOpen: true }
          : {
              field: "general",
              type: "error",
              title: "Revisa tus datos",
              message: msg,
              suggestions: [],
              isOpen: true,
            }
      );
      return false;
    }
    return true;
  }

  async function prepareAccess(data: { id: string; clientSecret: string }) {
    setPhase("generating");
    const response = await fetch(
      `/api/birthdays/reservations/${encodeURIComponent(data.id)}/tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSecret: data.clientSecret }),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result?.items))
      throw new Error(
        result?.message ||
          "No pudimos preparar el QR. Tu reserva ya está registrada; intenta nuevamente."
      );
    setShowBottleIceModal(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!reservationData && !runValidation()) return;
    setSubmitting(true);
    let creationPending = false;
    try {
      let data = reservationData;
      if (!data) {
        if (!selectedPack) return;
        setPhase("creating");
        const payload = {
          celebrantName: name.trim(),
          cardName: cardName.trim(),
          phone: whatsapp.trim(),
          documento: documento.trim(),
          identityProof,
          birthDate,
          date,
          timeSlot,
          packId,
          guestsPlanned: selectedPack.qrCount,
          wantsPhotoSession: wantsPhotoSession === true,
          ...(referrerId && { referrerId }),
        };
        creationPending = true;
        const response = await fetch("/api/birthdays/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          if (response.status >= 500) throw new Error("No se pudo confirmar la reserva.");
          creationPending = false;
          if (result?.code === "INVALID_IDENTITY") {
            setLookupDocument("");
            setIdentityProof("");
            setStep(0);
          }
          if (result?.code === "SLOT_FULL") setSlotsAttempt((value) => value + 1);
          const details = getServerErrorDetails(result?.code, result?.message);
          setModalMessage({ ...details, isOpen: true });
          return;
        }
        if (typeof result.id !== "string" || typeof result.clientSecret !== "string")
          throw new Error(
            "No pudimos recuperar el enlace de tu reserva. Contacta con el equipo antes de volver a reservar."
          );
        data = { id: result.id, clientSecret: result.clientSecret };
        setReservationData(data);
        creationPending = false;
      }
      await prepareAccess(data);
    } catch (error) {
      if (creationPending) setCreationUncertain(true);
      const details = getServerErrorDetails(
        undefined,
        creationPending
          ? "No pudimos confirmar si la reserva se guardó. Contacta al equipo antes de intentar otra reserva."
          : error instanceof Error
            ? error.message
            : "No pudimos procesar la solicitud."
      );
      setModalMessage({ ...details, isOpen: true });
    } finally {
      setSubmitting(false);
      setPhase("idle");
    }
  }

  // Handlers para el modal de hielo
  const handleBottleIceContinue = () => {
    if (reservationData) {
      router.push(
        `/marketing/birthdays/${reservationData.id}/qrs?cs=${encodeURIComponent(reservationData.clientSecret)}`
      );
    }
    setShowBottleIceModal(false);
    setReservationData(null);
  };

  const handleBottleIceCancel = async () => {
    if (!reservationData || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/birthdays/reservations/${encodeURIComponent(reservationData.id)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientSecret: reservationData.clientSecret }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "No se pudo cancelar la reserva.");
      setShowBottleIceModal(false);
      setReservationData(null);
      setModalMessage({
        field: "general",
        type: "info",
        title: "Reserva cancelada",
        message: "Tu reserva ha sido cancelada.",
        suggestions: [],
        isOpen: true,
      });
    } catch (error) {
      setShowBottleIceModal(false);
      setModalMessage({
        ...getServerErrorDetails(
          undefined,
          error instanceof Error ? error.message : "No se pudo cancelar la reserva."
        ),
        isOpen: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-300">
          Celebra con nosotros
        </p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Reserva tu cumpleaños</h1>
        <p className="mt-2 text-sm text-white/70">
          Completa estos pasos y obtén tus invitaciones QR.
        </p>
      </header>
      <div
        id="form"
        className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-7"
      >
        <ReservationProgress current={step} />
        <form className="mt-7 space-y-5" onSubmit={onSubmit} data-testid="reserve-form">
          {reservationData && (
            <p role="status" className="rounded-lg bg-emerald-500/15 p-3 text-sm">
              Tu reserva ya está registrada. Continúa para preparar y ver tus QR; no necesitas crear
              otra reserva.
            </p>
          )}
          {creationUncertain && (
            <p role="alert" className="rounded-lg bg-amber-500/15 p-3 text-sm">
              No pudimos confirmar si la reserva se guardó. Contacta al equipo antes de intentar
              otra reserva.
            </p>
          )}
          {referrerError && !reservationData && (
            <p role="alert" className="rounded-lg bg-rose-500/15 p-3 text-sm">
              {referrerError}{" "}
              <a className="underline" href="/marketing/birthdays/reservar">
                Continúa sin enlace de invitación
              </a>
              .
            </p>
          )}
          <fieldset disabled={!!reservationData || submitting}>
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Cuéntanos de ti</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Comienza con el DNI del cumpleañero para completar sus datos más rápido.
                  </p>
                </div>
                <div>
                  <label htmlFor="birthday-dni" className="block text-sm font-semibold">
                    DNI del cumpleañero
                  </label>
                  <input
                    id="birthday-dni"
                    data-testid="input-documento"
                    inputMode="numeric"
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base"
                    value={documento}
                    onChange={(e) => {
                      setDocumento(e.target.value.replace(/\D/g, "").slice(0, 8));
                      if (lookupDocument) {
                        setName("");
                        setDisplayName("");
                        setCardName("");
                        setBirthDate("");
                        setLookupDocument("");
                        setIdentityProof("");
                      }
                    }}
                    placeholder="8 dígitos"
                    maxLength={8}
                  />
                  {(!lookupDocument || !birthDate || !identityProof) && (
                    <div className="mt-2">
                      <BirthdayIdentityLookup
                        dni={documento}
                        isPublic
                        onResult={(person) => {
                          setLookupDocument(documento);
                          setIdentityProof(person.birthdayIdentityProof || "");
                          setName(person.name);
                          setDisplayName(person.displayName || person.name);
                          setCardName(birthdayCardName(person.name));
                          setBirthDate(person.birthday || "");
                          if (person.birthday) setDate(suggestedCelebration(person.birthday));
                        }}
                      />
                    </div>
                  )}
                </div>
                {lookupDocument && birthDate && identityProof && (
                  <>
                    <div>
                      <label htmlFor="birthday-name" className="block text-sm font-semibold">
                        Nombre y apellido
                      </label>
                      <input
                        id="birthday-name"
                        data-testid="input-name"
                        className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base"
                        value={displayName}
                        readOnly
                        placeholder="Se completa con tu DNI"
                      />
                    </div>
                    <div>
                      <label htmlFor="birthday-card-name" className="block text-sm font-semibold">Nombre en la tarjeta</label>
                      <input id="birthday-card-name" autoComplete="off" maxLength={BIRTHDAY_POLICY.maxName} className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                      <p className="mt-1 text-xs text-white/60">Puedes cambiar el nombre que aparecerá en tu invitación.</p>
                    </div>
                    {nextAge !== null && (
                      <p className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
                        Cumplirá <strong>{nextAge}</strong>
                      </p>
                    )}
                    <div>
                      <label htmlFor="birthday-phone" className="block text-sm font-semibold">
                        WhatsApp
                      </label>
                      <input
                        id="birthday-phone"
                        data-testid="input-whatsapp"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base"
                        value={whatsapp}
                        onChange={(e) =>
                          setWhatsapp(
                            e.target.value
                              .replace(/\D/g, "")
                              .replace(/^51(?=\d{9}$)/, "")
                              .slice(0, 9)
                          )
                        }
                        placeholder="912 345 678"
                        maxLength={9}
                      />
                      <p className="mt-1 text-xs text-white/60">9 dígitos, sin el código +51.</p>
                    </div>
                  </>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">¿Cuándo celebramos?</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Puedes cambiar la fecha sugerida por otra disponible.
                  </p>
                </div>
                <div>
                  <label htmlFor="birthday-date" className="block text-sm font-semibold">
                    Fecha de celebración
                  </label>
                  <input
                    id="birthday-date"
                    data-testid="input-date"
                    type="date"
                    className="mt-1 w-full min-w-0 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base"
                    value={date}
                    min={birthdayToday().toISODate() || undefined}
                    max={
                      birthdayToday()
                        .plus({ days: BIRTHDAY_POLICY.publicBookingDays })
                        .toISODate() || undefined
                    }
                    onChange={(e) => setDate(e.target.value)}
                  />
                  {date &&
                    birthdayDay(date) >
                      birthdayToday().plus({ days: BIRTHDAY_POLICY.publicBookingDays }) && (
                      <p className="mt-2 text-sm text-amber-200">
                        La fecha sugerida está fuera del plazo de reserva. Elige otra fecha
                        disponible o vuelve más cerca de tu cumpleaños.
                      </p>
                    )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Horario de llegada</p>
                  {slotsLoading && (
                    <p className="mt-2 text-sm text-white/65">Consultando horarios…</p>
                  )}
                  {slotsError && (
                    <p role="alert" className="mt-2 text-sm text-rose-300">
                      {slotsError}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setSlotsAttempt((value) => value + 1)}
                      >
                        Reintentar
                      </button>
                    </p>
                  )}
                  {!slotsLoading && !slotsError && !slots.some((item) => item.remaining > 0) && (
                    <p className="mt-2 text-sm text-amber-200">
                      No hay horarios disponibles para esta fecha. Elige otra.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {slots.map((item) => (
                      <button
                        key={item.slot}
                        type="button"
                        disabled={item.remaining <= 0}
                        aria-pressed={timeSlot === item.slot}
                        onClick={() => setTimeSlot(item.slot)}
                        className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-40 ${timeSlot === item.slot ? "border-orange-400 bg-orange-500/20 text-orange-100" : "border-white/20 bg-white/5"}`}
                      >
                        {item.slot}
                        {item.remaining <= 0 && <span className="block text-xs">Completo</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Elige tu pack</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Selecciona la opción que prefieras para tu celebración.
                  </p>
                </div>
                {loadingPacks && (
                  <p role="status" className="text-sm text-white/65">
                    Cargando packs…
                  </p>
                )}
                {packsError && (
                  <p role="alert" className="text-sm text-rose-300">
                    {packsError}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setPacksAttempt((value) => value + 1)}
                    >
                      Reintentar
                    </button>
                  </p>
                )}
                {!loadingPacks && !packsError && packs.length === 0 && (
                  <p className="text-sm text-amber-200">
                    No hay packs disponibles en este momento.
                  </p>
                )}
                <div role="radiogroup" aria-label="Pack de cumpleaños" className="space-y-3">
                  {packs.map((pack) => (
                    <label
                      key={pack.id}
                      className={`block cursor-pointer rounded-xl border p-4 ${packId === pack.id ? "border-orange-400 bg-orange-500/15" : "border-white/20 bg-white/5"}`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="pack"
                          value={pack.id}
                          checked={packId === pack.id}
                          onChange={() => setPackId(pack.id)}
                          className="mt-1 accent-orange-400"
                        />
                        <span className="min-w-0">
                          <span className="block font-bold">{pack.name}</span>
                          <span className="mt-1 block text-sm text-white/70">
                            {pack.qrCount} invitaciones QR
                          </span>
                          {pack.bottle && (
                            <span className="mt-1 block text-sm text-white/70">{pack.bottle}</span>
                          )}
                          {pack.perks?.map((perk, index) => (
                            <span
                              key={`${index}-${perk}`}
                              className="mt-1 block text-sm text-white/70"
                            >
                              • {perk}
                            </span>
                          ))}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <fieldset className="rounded-xl border border-orange-400/35 bg-orange-500/10 p-4">
                  <legend className="sr-only">¿Deseas una sesión de fotos?</legend>
                  <div className="flex items-start gap-3">
                    <Camera
                      aria-hidden="true"
                      className="mt-0.5 h-6 w-6 shrink-0 text-orange-300"
                    />
                    <div>
                      <p className="font-bold">¿Deseas una sesión de fotos?</p>
                      <p className="mt-1 text-sm text-white/70">
                        Indícanos si quieres incluirla en tu reserva.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      { label: "Sí, quiero", value: true },
                      { label: "No, gracias", value: false },
                    ].map((option) => (
                      <label
                        key={option.label}
                        className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${wantsPhotoSession === option.value ? "border-orange-400 bg-orange-500/25 text-orange-100" : "border-white/20 bg-white/5"}`}
                      >
                        <input
                          type="radio"
                          name="photo-session"
                          checked={wantsPhotoSession === option.value}
                          onChange={() => setWantsPhotoSession(option.value)}
                          className="accent-orange-400"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Revisa tu reserva</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Confirma que todo esté correcto antes de continuar.
                  </p>
                </div>
                <dl className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm">
                  {[
                    ["Cumpleañero", displayName],
                    ["DNI", documento],
                    ["WhatsApp", whatsapp],
                    ["Próximo cumpleaños", nextAge === null ? "" : `${nextAge} años`],
                    ["Celebración", date],
                    ["Horario", timeSlot],
                    ["Pack", selectedPack?.name || ""],
                    ["Set fotográfico", wantsPhotoSession ? "Sí" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-3">
                      <dt className="text-white/60">{label}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm text-white/65">
                  Después de confirmar podrás ver y compartir tus invitaciones QR.
                </p>
              </div>
            )}
          </fieldset>
          {stepError && (
            <p role="alert" className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">
              {stepError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
            {step > 0 && !reservationData && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setStepError("");
                  setStep((value) => value - 1);
                }}
                className="min-h-12 rounded-xl border border-white/20 px-5 py-3 font-semibold sm:w-1/3"
              >
                Volver
              </button>
            )}
            {step === 0 && (!lookupDocument || !birthDate || !identityProof) ? null : step < 3 &&
              !reservationData ? (
              <button
                key="next-step"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  nextStep();
                }}
                className="min-h-12 flex-1 rounded-xl bg-orange-500 px-5 py-3 font-bold text-slate-950 hover:bg-orange-400"
              >
                Continuar
              </button>
            ) : (
              <button
                key="submit-reservation"
                data-testid="submit-reservation"
                type="submit"
                disabled={
                  submitting ||
                  creationUncertain ||
                  (!reservationData &&
                    (loadingPacks ||
                      !!packsError ||
                      packs.length === 0 ||
                      slotsLoading ||
                      !!slotsError ||
                      !timeSlot ||
                      referrerLoading ||
                      !!referrerError))
                }
                className="min-h-12 flex-1 rounded-xl bg-orange-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
              >
                {submitting
                  ? phase === "creating"
                    ? "Creando reserva…"
                    : "Preparando accesos…"
                  : reservationData
                    ? "Continuar y ver QR"
                    : "Confirmar reserva"}
              </button>
            )}
          </div>
          {submitting && (
            <p
              role="status"
              className="text-center text-sm text-white/70"
              data-testid={phase === "creating" ? "state-creating" : "state-generating"}
            >
              {phase === "creating"
                ? "Registrando tu solicitud…"
                : "Generando tus invitaciones QR…"}
            </p>
          )}
        </form>
      </div>
      <BottleIceModal
        isOpen={showBottleIceModal}
        onClose={handleBottleIceCancel}
        onContinue={handleBottleIceContinue}
        busy={submitting}
      />
      {modalMessage && (
        <ReservationMessageModal
          {...modalMessage}
          onClose={() => setModalMessage(null)}
          actionButton={{ label: "Entendido", onClick: () => setModalMessage(null) }}
        />
      )}
    </section>
  );
}

export default function ReservarCumplePage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-6">Cargando…</div>}>
      <ReservarCumplePageInner />
    </Suspense>
  );
}
