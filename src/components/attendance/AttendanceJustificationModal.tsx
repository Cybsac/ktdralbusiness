"use client";
import { type FormEvent, useEffect, useRef, useState } from "react";

type Target = {
  day: string;
  personId: string;
  personName: string;
  justification: { reason: string; by: string; at: string | null } | null;
};
type Event = { id: string; action: string; reason: string; actor: string; createdAt: string };
export function AttendanceJustificationModal({
  target,
  onClose,
  onSaved,
}: {
  target: Target;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(target.justification?.reason || "");
  const [action, setAction] = useState<"justify" | "revoke">("justify");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const controller = new AbortController();
    const query = new URLSearchParams({ day: target.day, personId: target.personId });
    fetch(`/api/admin/attendance/justification?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setEvents(data.events))
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError("No se pudo cargar el historial.");
      });
    return () => {
      controller.abort();
      if (element?.open) element.close();
    };
  }, [target.day, target.personId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/attendance/justification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: target.day, personId: target.personId, action, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "No se pudo guardar");
      onSaved();
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="justification-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/60 dark:bg-slate-800 dark:text-white"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 id="justification-title" className="text-lg font-bold">
          Justificación de salida
        </h2>
        <p className="text-sm">
          {target.personName} · {target.day}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          La jornada sigue incompleta. Esta justificación no crea una salida ni modifica la
          calificación.
        </p>
        {target.justification && (
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={action === "justify"}
              onClick={() => {
                setAction("justify");
                setReason(target.justification?.reason || "");
              }}
              className="rounded border px-3 py-2"
            >
              Actualizar comentario
            </button>
            <button
              type="button"
              aria-pressed={action === "revoke"}
              onClick={() => {
                setAction("revoke");
                setReason("");
              }}
              className="rounded border px-3 py-2"
            >
              Revocar justificación
            </button>
          </div>
        )}
        <label className="block text-sm">
          {action === "revoke" ? "Motivo de la revocación" : "¿Qué sucedió?"}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            rows={3}
            className="mt-1 w-full rounded border p-3 dark:bg-slate-900"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded border px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 3}
            className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : action === "revoke" ? "Revocar" : "Guardar justificación"}
          </button>
        </div>
        <section className="border-t pt-3">
          <h3 className="text-sm font-semibold">Historial</h3>
          {historyError && (
            <p role="alert" className="text-xs text-rose-700">
              {historyError}
            </p>
          )}
          {events.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {events.map((item) => (
                <li key={item.id} className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <p className="font-medium">
                    {item.action === "REVOKED" ? "Revocada" : "Justificada"} · {item.actor}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{item.reason}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            !historyError && <p className="mt-2 text-xs text-slate-500">Sin cambios registrados.</p>
          )}
        </section>
      </form>
    </dialog>
  );
}
