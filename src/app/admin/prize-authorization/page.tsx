"use client";
import { type FormEvent, useRef, useState } from "react";

import {
  PersonalCodeManager,
  type PersonalCodeSummary,
} from "@/components/prize-authorization/PersonalCodeManager";
import { usePrizeAuthorizationRefresh } from "@/hooks/usePrizeAuthorizationRefresh";
import {
  defaultPrizePolicy,
  type PrizePolicy,
  prizeScopes,
} from "@/lib/prize-authorization/policy";

type Snapshot = {
  policy: PrizePolicy;
  revision: number;
  collaborators: PersonalCodeSummary[];
  requiredNow: boolean;
  validUntil: string | null;
};
function formatDate(value: string | null, timezone: string) {
  return value
    ? new Date(value).toLocaleString("es-PE", { timeZone: timezone })
    : "Hasta cambiar la configuración";
}
export default function PrizeAuthorizationPage() {
  const [policy, setPolicy] = useState<PrizePolicy>(defaultPrizePolicy);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [dates, setDates] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const formInitialized = useRef(false);
  async function load(updateForm = true, signal?: AbortSignal) {
    const response = await fetch("/api/admin/prize-authorization", { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudo consultar la configuración");
    if (signal?.aborted) return;
    setSnapshot(data);
    if (updateForm) {
      formInitialized.current = true;
      setEditRevision(data.revision);
      setPolicy(data.policy);
      setDates(data.policy.dates.join("\n"));
    }
  }
  usePrizeAuthorizationRefresh(
    async (signal) => {
      try {
        await load(!formInitialized.current, signal);
        if (!signal.aborted) setError("");
      } catch (e: any) {
        if (!signal.aborted) setError(e.message);
      }
    },
    snapshot?.validUntil,
    () =>
      setSnapshot((current) =>
        current
          ? {
              ...current,
              collaborators: current.collaborators.map((person) => ({ ...person, code: null })),
            }
          : null
      )
  );
  function update<K extends keyof PrizePolicy>(key: K, value: PrizePolicy[K]) {
    setPolicy((current) => ({ ...current, [key]: value }));
  }
  async function save(rotate = false) {
    if (!snapshot) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/prize-authorization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: { ...policy, dates: dates.split(/[\s,]+/).filter(Boolean) },
          expectedRevision: editRevision,
          rotate,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message +
            (result.details?.fieldErrors
              ? ": " + Object.values(result.details.fieldErrors).flat().join(". ")
              : "")
        );
      await load();
      setMessage(
        "Configuración guardada. Las claves se habilitaron automáticamente para las cuentas activas sin clave. Las revocaciones se conservaron."
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <a href="/admin/prizes" className="text-sm underline">
          Volver a premios
        </a>
        <h1 className="mt-3 text-2xl font-bold">Autorización de canjes</h1>
        <p className="mt-2 text-sm">
          Con sesión activa, cualquier colaborador confirma la entrega sin OTP y queda identificado.
          En un teléfono público se requiere la clave personal del colaborador que entrega.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400 p-3 text-red-600 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-green-500 p-3">
          {message}
        </p>
      )}
      <section className="rounded-xl border border-slate-400 p-5 space-y-2">
        <h2 className="font-semibold">Canjes desde teléfonos públicos</h2>
        <p className="text-sm">
          {snapshot?.requiredNow
            ? "Habilitados con clave personal"
            : "Cerrados o pendientes de configuración"}
        </p>
        {snapshot?.revision ? (
          <p className="text-sm">
            Próximo cambio de claves: {formatDate(snapshot.validUntil, snapshot.policy.timezone)}
          </p>
        ) : (
          <p className="text-sm">
            Al guardar, se habilitarán automáticamente las claves de los colaboradores activos.
          </p>
        )}
        <button
          className="btn-outline"
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            load().catch((e) => setError(e.message));
          }}
        >
          Recargar configuración
        </button>
      </section>
      <PersonalCodeManager
        collaborators={snapshot?.collaborators ?? []}
        configured={!!snapshot?.revision}
        onChanged={() => load(false)}
      />
      {snapshot && snapshot.revision !== editRevision && (
        <p role="alert">
          Otro administrador cambió la configuración. Las claves mostradas ya están actualizadas;
          recarga antes de editar.
        </p>
      )}
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-400 p-5">
        <label className="block font-medium">
          <input
            type="checkbox"
            checked={policy.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />{" "}
          Habilitar canjes públicos con clave personal
        </label>
        <p className="text-sm">
          Al desactivar esta opción se cierran solo los canjes públicos. Las sesiones activas siguen
          identificando a su usuario sin OTP.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Cambiar la clave
            <select
              className="mt-1 block w-full rounded border bg-transparent p-2"
              value={policy.rotation}
              onChange={(e) => update("rotation", e.target.value as PrizePolicy["rotation"])}
            >
              <option value="daily">Cada día</option>
              <option value="weekly">Cada semana (lunes)</option>
              <option value="monthly">Cada mes</option>
              <option value="interval">Cada intervalo personalizado</option>
              <option value="fixed">Mantener durante la vigencia</option>
            </select>
          </label>
          <label className="text-sm">
            Zona horaria
            <input
              required
              className="mt-1 block w-full rounded border bg-transparent p-2"
              value={policy.timezone}
              onChange={(e) => update("timezone", e.target.value)}
            />
          </label>
          {policy.rotation === "interval" && (
            <>
              <label className="text-sm">
                Intervalo en minutos
                <input
                  required
                  type="number"
                  min={1}
                  max={525600}
                  className="mt-1 block w-full rounded border bg-transparent p-2"
                  value={policy.intervalMinutes}
                  onChange={(e) => update("intervalMinutes", Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                Inicio del intervalo (hora de tu dispositivo)
                <input
                  required
                  className="mt-1 block w-full rounded border bg-transparent p-2"
                  type="datetime-local"
                  value={new Date(
                    new Date(policy.anchorAt).getTime() -
                      new Date(policy.anchorAt).getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .slice(0, 16)}
                  onChange={(e) => {
                    if (e.target.value) update("anchorAt", new Date(e.target.value).toISOString());
                  }}
                />
              </label>
            </>
          )}
          <label className="text-sm">
            Permitir canjes
            <select
              className="mt-1 block w-full rounded border bg-transparent p-2"
              value={policy.schedule}
              onChange={(e) => update("schedule", e.target.value as PrizePolicy["schedule"])}
            >
              <option value="always">Siempre</option>
              <option value="range">Dentro de un rango</option>
              <option value="dates">Solo fechas específicas</option>
            </select>
          </label>
        </div>
        {policy.schedule === "range" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["startsAt", "endsAt"] as const).map((key) => (
              <label className="text-sm" key={key}>
                {key === "startsAt" ? "Desde" : "Hasta"} (hora de tu dispositivo)
                <input
                  required
                  type="datetime-local"
                  className="mt-1 block w-full rounded border bg-transparent p-2"
                  value={
                    policy[key]
                      ? new Date(
                          new Date(policy[key]!).getTime() -
                            new Date(policy[key]!).getTimezoneOffset() * 60000
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    update(key, e.target.value ? new Date(e.target.value).toISOString() : null)
                  }
                />
              </label>
            ))}
          </div>
        )}
        {policy.schedule === "dates" && (
          <label className="block text-sm">
            Fechas habilitadas (AAAA-MM-DD, una por línea)
            <textarea
              required
              className="mt-1 block w-full rounded border bg-transparent p-2"
              rows={4}
              value={dates}
              onChange={(e) => setDates(e.target.value)}
            />
          </label>
        )}
        <fieldset>
          <legend className="text-sm font-medium">Días de la semana (sin marcar: todos)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={policy.weekdays.includes(index + 1)}
                  onChange={(e) =>
                    update(
                      "weekdays",
                      e.target.checked
                        ? [...policy.weekdays, index + 1]
                        : policy.weekdays.filter((v) => v !== index + 1)
                    )
                  }
                />{" "}
                {day}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Máximo de intentos
            <input
              required
              className="mt-1 block w-full rounded border bg-transparent p-2"
              type="number"
              min={1}
              max={30}
              value={policy.maxAttempts}
              onChange={(e) => update("maxAttempts", Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Ventana de bloqueo (minutos)
            <input
              required
              className="mt-1 block w-full rounded border bg-transparent p-2"
              type="number"
              min={1}
              max={60}
              value={policy.lockMinutes}
              onChange={(e) => update("lockMinutes", Number(e.target.value))}
            />
          </label>
        </div>
        <p className="text-sm">
          Protege: {Object.values(prizeScopes).join(", ")}. Ver o revelar un premio no consume la
          clave. La entrega pública pide la clave personal.
        </p>
        <p className="text-sm">
          Guardar cualquier cambio reemplaza las claves personales vigentes. Las claves no se
          guardan en este dispositivo ni se incluyen en los QR.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn" disabled={busy || !snapshot}>
            {busy ? "Guardando…" : "Guardar configuración"}
          </button>
          <button
            type="button"
            className="btn-outline"
            disabled={busy || !snapshot?.revision}
            onClick={() => void save(true)}
          >
            Reemplazar todas las claves
          </button>
        </div>
      </form>
    </div>
  );
}
