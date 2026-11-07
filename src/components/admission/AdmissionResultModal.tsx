"use client";
import { useEffect, useRef } from "react";

export type AdmissionResult = {
  result: "ADULT" | "MINOR" | "UNKNOWN";
  name?: string;
  age?: number | null;
  source?: string;
  proof?: string;
  visit?: { inside: boolean; entryCount: number } | null;
  message?: string;
};

export function AdmissionResultModal({
  result,
  busy,
  message,
  onMove,
  onClose,
}: {
  result: AdmissionResult;
  busy: boolean;
  message: string;
  onMove: (action: "ENTRY" | "EXIT") => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  const title =
    result.result === "ADULT"
      ? "MAYOR DE EDAD"
      : result.result === "MINOR"
        ? "MENOR DE EDAD"
        : "NO VERIFICADO";
  const color =
    result.result === "ADULT"
      ? "bg-emerald-100 text-emerald-950"
      : result.result === "MINOR"
        ? "bg-rose-100 text-rose-950"
        : "bg-amber-100 text-amber-950";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="admission-result-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/70 dark:bg-slate-900 dark:text-white"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className={`rounded-xl p-4 ${color}`}>
          <h2 id="admission-result-title" className="text-2xl font-bold">
            {title}
          </h2>
          {result.name && <p className="mt-2 break-words text-xl font-semibold">{result.name}</p>}
          {result.age != null && <p className="mt-1 text-lg font-medium">{result.age} años</p>}
          {result.message && <p className="mt-2">{result.message}</p>}
          <p className="mt-2 text-sm">
            {result.source === "MANUAL"
              ? "Datos ingresados manualmente"
              : result.source === "CLUZTER"
                ? "Datos consultados en Cybsac Perú"
                : "Requiere revisión"}
          </p>
        </div>
        {result.result === "MINOR" && (
          <p className="font-semibold text-rose-700 dark:text-rose-300">No registrar ingreso.</p>
        )}
        {result.result === "ADULT" && (
          <>
            <p className="text-sm">
              {result.visit
                ? result.visit.inside
                  ? "Ya figura dentro en esta jornada."
                  : "Ya registró salida; puede reingresar."
                : "Sin ingreso registrado en esta jornada."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onMove(result.visit?.inside ? "EXIT" : "ENTRY")}
              className="w-full rounded-lg bg-emerald-700 p-4 text-lg font-bold text-white disabled:opacity-50"
            >
              {result.visit?.inside
                ? "Registrar salida"
                : result.visit
                  ? "Registrar reingreso"
                  : "Registrar ingreso"}
            </button>
          </>
        )}
        {message && (
          <p role="status" className="rounded border p-3">
            {message}
          </p>
        )}
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onClose}
          className="w-full rounded-lg border border-slate-400 px-4 py-3 font-semibold disabled:opacity-50"
        >
          Siguiente persona
        </button>
      </div>
    </dialog>
  );
}
