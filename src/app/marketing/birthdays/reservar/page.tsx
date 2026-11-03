"use client";
export const dynamic = "force-dynamic";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { birthdayDay, birthdayToday } from "@/lib/birthdays/calendar";
import { BIRTHDAY_POLICY } from "@/lib/birthdays/policy";
import { reservationFields } from "@/lib/birthdays/reservation-input";
import { ReservationMessageModal } from "@/components/ReservationMessageModal";
import { BottleIceModal } from "@/components/BottleIceModal";
import { getValidationErrorDetails, getServerErrorDetails } from "@/lib/reservation-errors";

function ReservarCumplePageInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Tipo para packs
  type PackType = { id: string; name: string; qrCount: number; bottle?: string | null; perks?: string[] };

  // Packs
  const [packs, setPacks] = useState<PackType[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [packsAttempt, setPacksAttempt] = useState(0);
  const [packsError, setPacksError] = useState("");

  // Form
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(() => birthdayToday().toISODate() || "");
  const [timeSlot, setTimeSlot] = useState("");
  const [packId, setPackId] = useState<string>("");
  const [wantsPhotoSession, setWantsPhotoSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
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
  const [reservationData, setReservationData] = useState<{ id: string; clientSecret: string } | null>(null);

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
    const byId = packs.find(p => p.id === q);
    if (byId) { setPackId(byId.id); return; }

  }, [params, packs]);

  // Referrer
  useEffect(() => {
    const ref = params?.get("ref");
    if (ref && ref.trim()) {
      const controller = new AbortController();
      setReferrerLoading(true); setReferrerError(''); setReferrerId(null);
      fetch(`/api/birthdays/referrers/${encodeURIComponent(ref)}`, { signal: controller.signal })
        .then(async res => { const data = await res.json(); if (!res.ok || !data.referrer?.active) throw new Error(); return data.referrer.id as string; })
        .then(setReferrerId)
        .catch(() => { if (!controller.signal.aborted) setReferrerError('No se pudo verificar el enlace de invitación.'); })
        .finally(() => { if (!controller.signal.aborted) setReferrerLoading(false); });
      return () => controller.abort();
    } else {
      setReferrerId(null);
      setReferrerError(''); setReferrerLoading(false);
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
      } catch (e:any) {
        setPacksError("No se pudieron cargar los packs. Intenta nuevamente.");
      } finally {
        setLoadingPacks(false);
      }
    })();
  }, [packsAttempt]);

  useEffect(() => {
    if (!date || !birthdayDay(date).isValid) { setSlots([]); setTimeSlot(''); setSlotsLoading(false); return; }
    const controller = new AbortController();
    setSlotsLoading(true); setSlotsError(''); setSlots([]);
    fetch(`/api/birthdays/slots?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.slots)) throw new Error(data?.message || 'No se pudieron consultar los horarios.');
        return data.slots as { slot: string; remaining: number }[];
      }).then(items => {
        setSlots(items);
        setTimeSlot(current => items.some(item => item.slot === current && item.remaining > 0) ? current : items.find(item => item.remaining > 0)?.slot || '');
      }).catch(() => { if (!controller.signal.aborted) { setSlotsError('No se pudieron consultar los horarios.'); setTimeSlot(''); } })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [date, slotsAttempt]);

  const selectedPack = useMemo(() => packs.find(p => p.id === packId) || null, [packs, packId]);

  // Validación
  function validateBasic(): string | null {
    if (!name.trim()) return "El nombre es obligatorio";
    if (name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres";
    if (name.trim().split(/\s+/).filter(Boolean).length < 2) return "Ingresa nombre y apellido (mínimo 2 palabras)";
    if (!whatsapp.trim()) return "WhatsApp es obligatorio";
    if (!reservationFields.phone.safeParse(whatsapp.trim()).success) return "WhatsApp debe tener exactamente 9 dígitos (ej: 912345678)";
    if (!documento.trim()) return "Documento es obligatorio";
    // Alinear con backend: DNI exacto 8 dígitos
    if (!reservationFields.documento.safeParse(documento.trim()).success) return "Documento debe tener 8 dígitos (DNI)";
    if (!reservationFields.email.safeParse(email.trim()).success) return "Email no es válido";
    if (!reservationFields.date.safeParse(date).success) return "Selecciona una fecha válida";
    if (!timeSlot) return "Selecciona un horario";
    if (!selectedPack || selectedPack.qrCount < 1) return "Selecciona un Pack";
    return null;
  }

  function runValidation(): boolean {
    const msg = validateBasic();
    if (msg) {
      const details = getValidationErrorDetails(msg);
      if (details) setModalMessage({ ...details, isOpen: true });
      return false;
    }
    return true;
  }

  async function prepareAccess(data: { id: string; clientSecret: string }) {
    setPhase("generating");
    const response = await fetch(`/api/birthdays/reservations/${encodeURIComponent(data.id)}/tokens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientSecret: data.clientSecret }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result?.items)) throw new Error(result?.message || "No pudimos preparar el QR. Tu reserva ya está registrada; intenta nuevamente.");
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
        const payload = { celebrantName: name.trim(), phone: whatsapp.trim(), documento: documento.trim(), email: email.trim() || undefined, date, timeSlot, packId, guestsPlanned: selectedPack.qrCount, wantsPhotoSession, ...(referrerId && { referrerId }) };
        creationPending = true;
        const response = await fetch("/api/birthdays/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) { if (response.status >= 500) throw new Error('No se pudo confirmar la reserva.'); creationPending = false; if (result?.code === 'SLOT_FULL') setSlotsAttempt(value => value + 1); const details = getServerErrorDetails(result?.code, result?.message); setModalMessage({ ...details, isOpen: true }); return; }
        if (typeof result.id !== "string" || typeof result.clientSecret !== "string") throw new Error("No pudimos recuperar el enlace de tu reserva. Contacta con el equipo antes de volver a reservar.");
        data = { id: result.id, clientSecret: result.clientSecret };
        setReservationData(data);
        creationPending = false;
      }
      await prepareAccess(data);
    } catch (error) {
      if (creationPending) setCreationUncertain(true);
      const details = getServerErrorDetails(undefined, creationPending ? 'No pudimos confirmar si la reserva se guardó. Contacta al equipo antes de intentar otra reserva.' : error instanceof Error ? error.message : "No pudimos procesar la solicitud.");
      setModalMessage({ ...details, isOpen: true });
    } finally { setSubmitting(false); setPhase("idle"); }
  }

  // Handlers para el modal de hielo
  const handleBottleIceContinue = () => {
    if (reservationData) {
      router.push(`/marketing/birthdays/${reservationData.id}/qrs?cs=${encodeURIComponent(reservationData.clientSecret)}`);
    }
    setShowBottleIceModal(false);
    setReservationData(null);
  };

  const handleBottleIceCancel = async () => {
    if (!reservationData || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/birthdays/reservations/${encodeURIComponent(reservationData.id)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientSecret: reservationData.clientSecret }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || 'No se pudo cancelar la reserva.');
      setShowBottleIceModal(false);
      setReservationData(null);
      setModalMessage({ field: 'general', type: 'info', title: 'Reserva cancelada', message: 'Tu reserva ha sido cancelada.', suggestions: [], isOpen: true });
    } catch (error) {
      setShowBottleIceModal(false);
      setModalMessage({ ...getServerErrorDetails(undefined, error instanceof Error ? error.message : 'No se pudo cancelar la reserva.'), isOpen: true });
    } finally { setSubmitting(false); }
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 md:py-10 lg:py-12">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 md:p-10 space-y-5">
        <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-orange-300 to-red-400">
            Reserva y genera tus tarjetas al toque
          </span>
        </h1>
        <p className="text-sm md:text-base opacity-85 max-w-2xl leading-relaxed">
          Confirma tu reserva y genera tus tarjetas de invitación al toque. Completa los datos y
          obtén de inmediato tus accesos QR.
        </p>
      </div>

      <div id="form" className="scroll-mt-24 md:scroll-mt-32" />

      <form className="mt-6 space-y-5 md:space-y-6" onSubmit={onSubmit} data-testid="reserve-form">
        {reservationData && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">Tu reserva ya está registrada. Continúa para preparar y ver tu QR; no necesitas crear otra reserva.</p>}
        {creationUncertain && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">No pudimos confirmar si la reserva se guardó. Contacta al equipo antes de intentar otra reserva.</p>}
        {referrerError && !reservationData && <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">{referrerError} Revisa el enlace o <a className="underline" href="/marketing/birthdays/reservar">continúa sin referidor</a>.</p>}
        <fieldset disabled={!!reservationData || submitting} className="space-y-5 md:space-y-6">
        <div>
          <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">
            Nombre del cumpleañero
          </label>
          <input
            data-testid="input-name"
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={name}
            onChange={(e) => {
              const capitalized = e.target.value.replace(/\b\w/g, (l) => l.toUpperCase());
              setName(capitalized);
            }}
            placeholder="Juan Pérez"
            maxLength={BIRTHDAY_POLICY.maxName}
          />
          <p className="mt-1 text-xs text-white/60">Nombre completo del cumpleañero</p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">WhatsApp</label>
          <input
            data-testid="input-whatsapp"
            type="tel"
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={whatsapp}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, "").replace(/^51(?=\d{9}$)/, "");
              setWhatsapp(cleaned.slice(0, 9));
            }}
            placeholder="912 345 678"
            maxLength={9}
          />
          <p className="mt-1 text-xs text-white/60">Solo números, sin +51 (ej: 912345678)</p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">Documento</label>
          <input
            data-testid="input-documento"
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={documento}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="12345678"
            maxLength={8}
          />
          <p className="mt-1 text-xs text-white/60">DNI (8 dígitos)</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">Fecha</label>
            <input
              data-testid="input-date"
              type="date"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={date}
              min={birthdayToday().toISODate() || undefined}
              max={birthdayToday().plus({ days: BIRTHDAY_POLICY.publicBookingDays }).toISODate() || undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">Horario</label>
            <select
              data-testid="input-timeslot"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
            >
              {!timeSlot && <option className="text-black" value="">{slotsLoading ? 'Consultando horarios…' : 'Sin horarios disponibles'}</option>}
              {slots.map(item => <option className="text-black" key={item.slot} value={item.slot} disabled={item.remaining <= 0}>{item.slot}{item.remaining <= 0 ? ' · Completo' : ''}</option>)}
            </select>
            {slotsError && <p role="alert" className="mt-1 text-xs text-rose-300">{slotsError} <button type="button" className="underline" onClick={() => setSlotsAttempt(value => value + 1)}>Reintentar</button></p>}
          </div>
        </div>

        <div>
          {packsError && <p role="alert" className="text-sm text-rose-300">{packsError} <button type="button" className="underline" onClick={() => setPacksAttempt(value => value + 1)}>Reintentar</button></p>}
          {!loadingPacks && !packsError && packs.length === 0 && <p className="text-sm text-amber-200">No hay packs disponibles en este momento.</p>}
          <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">Pack</label>
          <select
            data-testid="input-pack"
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 focus:bg-white/10 transition-colors px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
          >
            <option className="text-black" value="">Selecciona un Pack…</option>
            {packs.map((p) => (
              <option className="text-black" key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide font-semibold opacity-75">
            Set fotográfico
          </label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWantsPhotoSession(false)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                !wantsPhotoSession
                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                  : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => setWantsPhotoSession(true)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                wantsPhotoSession
                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                  : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              Sí
            </button>
          </div>
          <p className="mt-1 text-xs text-white/60">
            Marca si quieres que tu reserva incluya set fotográfico.
          </p>
        </div>

        </fieldset>
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3">
          <button
            data-testid="submit-reservation"
            type="submit"
            disabled={submitting || creationUncertain || (!reservationData && (loadingPacks || !!packsError || packs.length === 0 || slotsLoading || !!slotsError || !timeSlot || referrerLoading || !!referrerError))}
            className="rounded-lg px-6 py-3 text-sm font-semibold tracking-wide bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/70 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (phase === "creating" ? "Creando reserva…" : "Preparando accesos…") : reservationData ? "Continuar y ver QR" : "Confirmar y ver QRs"}
          </button>
          {submitting ? (
            <div className="text-xs sm:text-sm opacity-85 animate-pulse" data-testid={phase === "creating" ? "state-creating" : "state-generating"}>
              {phase === "creating" ? "Registrando tu solicitud…" : "Generando tus tarjetas QR. Esto puede tardar unos segundos."}
            </div>
          ) : null}
        </div>
      </form>

      {/* Modal de información sobre hielo y complementos */}
      <BottleIceModal
        isOpen={showBottleIceModal}
        onClose={handleBottleIceCancel}
        onContinue={handleBottleIceContinue}
        busy={submitting}
      />

      {modalMessage && (
        <ReservationMessageModal
          field={modalMessage.field}
          type={modalMessage.type}
          title={modalMessage.title}
          message={modalMessage.message}
          suggestions={modalMessage.suggestions}
          isOpen={modalMessage.isOpen}
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
