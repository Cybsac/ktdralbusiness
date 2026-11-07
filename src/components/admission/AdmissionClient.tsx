"use client";
import { useCallback, useEffect, useState } from "react";

import { DOCUMENT_TYPE_CHOICES, isValidDocumentNumber } from "@/lib/users/document";

import { type AdmissionResult, AdmissionResultModal } from "./AdmissionResultModal";

type Summary = {
  day: string;
  unique: number;
  entries: number;
  inside: number;
  checks: Record<string, number>;
  recent: { id: string; action: string; operator: string; createdAt: string }[];
};
export function AdmissionClient({ showSummary = false }: { showSummary?: boolean }) {
  const [type, setType] = useState("DNI");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [result, setResult] = useState<AdmissionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const refresh = useCallback(async () => {
    if (!showSummary) return;
    try {
      const response = await fetch("/api/admission/summary", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setSummary(await response.json());
      setSummaryError("");
    } catch {
      setSummaryError("No se pudo actualizar el resumen.");
    }
  }, [showSummary]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  function resetResult() {
    setResult(null);
    setMessage("");
  }
  function updateNumber(value: string) {
    setNumber(
      type === "DNI"
        ? value.replace(/\D/g, "").slice(0, 8)
        : value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 30)
    );
    resetResult();
  }
  async function check() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/admission/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: type,
          documentNumber: number,
          ...(type === "DNI" ? {} : { manualName: name, manualBirthDate: birthDate }),
        }),
      });
      const data = await response.json();
      if (!response.ok && data.result !== "UNKNOWN")
        throw new Error(data.message || "No se pudo verificar");
      setResult(data);
      void refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo verificar");
    } finally {
      setBusy(false);
    }
  }
  async function movement(action: "ENTRY" | "EXIT") {
    if (!result?.proof || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admission/movement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: result.proof, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo registrar el movimiento");
      setMessage(data.message);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              visit: {
                inside: data.inside,
                entryCount: (prev.visit?.entryCount || 0) + (action === "ENTRY" ? 1 : 0),
              },
            }
          : null
      );
      void refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el movimiento");
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    setNumber("");
    setName("");
    setBirthDate("");
    resetResult();
  }
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Admisión de clientes</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Verifica la edad y compara siempre el documento físico con la persona.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <label className="block text-sm font-semibold">
            Tipo de documento
            <select
              value={type}
              disabled={busy}
              onChange={(e) => {
                setType(e.target.value);
                clear();
              }}
              className="mt-1 w-full rounded border p-3 dark:bg-slate-900"
            >
              {DOCUMENT_TYPE_CHOICES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Número de documento
            <input
              type="text"
              value={number}
              disabled={busy}
              inputMode={type === "DNI" ? "numeric" : "text"}
              pattern={type === "DNI" ? "[0-9]*" : undefined}
              enterKeyHint={type === "DNI" ? "search" : "done"}
              autoComplete="off"
              onChange={(e) => updateNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && type === "DNI" && isValidDocumentNumber(number, type) && !busy) {
                  e.preventDefault();
                  e.currentTarget.blur();
                  void check();
                }
              }}
              className="mt-1 w-full rounded border p-3 text-center font-mono text-3xl tracking-widest dark:bg-slate-900"
              placeholder={type === "DNI" ? "00000000" : "Número"}
            />
          </label>
          {type === "DNI" && <p className="text-xs text-slate-500 dark:text-slate-400">Puedes escribir con el teclado del celular o usar los botones.</p>}
          {type === "DNI" && (
            <div className="grid grid-cols-3 gap-2" aria-label="Teclado numérico">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Borrar", "0", "⌫"].map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    key === "Borrar"
                      ? updateNumber("")
                      : key === "⌫"
                        ? updateNumber(number.slice(0, -1))
                        : updateNumber(number + key)
                  }
                  className="h-16 rounded-lg border bg-slate-50 text-2xl font-bold active:bg-blue-100 disabled:opacity-50 dark:bg-slate-700"
                >
                  {key}
                </button>
              ))}
            </div>
          )}
          {type !== "DNI" && (
            <div className="space-y-3">
              <p className="text-sm">
                Verificación manual: copia los datos del documento físico. No se consulta automáticamente.
              </p>
              <label className="block text-sm">
                Nombre completo
                <input
                  value={name}
                  disabled={busy}
                  onChange={(e) => {
                    setName(e.target.value);
                    resetResult();
                  }}
                  className="mt-1 w-full rounded border p-3 dark:bg-slate-900"
                />
              </label>
              <label className="block text-sm">
                Fecha de nacimiento
                <input
                  type="date"
                  value={birthDate}
                  disabled={busy}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    resetResult();
                  }}
                  className="mt-1 w-full rounded border p-3 dark:bg-slate-900"
                />
              </label>
            </div>
          )}
          <button
            type="button"
            onClick={check}
            disabled={
              busy ||
              !isValidDocumentNumber(number, type) ||
              (type !== "DNI" && (!name.trim() || !birthDate))
            }
            className="w-full rounded-lg bg-blue-700 p-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {busy ? "Procesando…" : type === "DNI" ? "Consultar DNI" : "Verificar edad"}
          </button>
        </section>
        {message && !result && (
          <p role="alert" className="rounded border p-3">
            {message}
          </p>
        )}
        {result && (
          <AdmissionResultModal
            result={result}
            busy={busy}
            message={message}
            onMove={movement}
            onClose={clear}
          />
        )}
      </div>
      {showSummary && (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-bold">Resumen de jornada {summary?.day || ""}</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded border px-3 py-2"
            >
              Actualizar
            </button>
          </div>
          {summaryError && <p role="alert">{summaryError}</p>}
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Personas únicas", summary.unique],
                  ["Ingresos, con reingresos", summary.entries],
                  ["Dentro según registros", summary.inside],
                  ["Consultas de menores", summary.checks.MINOR || 0],
                  ["Consultas sin verificar", summary.checks.UNKNOWN || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded border p-3">
                    <div className="text-sm">{label}</div>
                    <strong className="text-2xl">{value}</strong>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-500">
                Las consultas pueden repetirse. El número dentro depende de que se registren las
                salidas y corresponde a esta jornada; no es aforo oficial.
              </p>
              <h3 className="font-semibold">Movimientos recientes</h3>
              {summary.recent.length ? (
                <ul className="space-y-2 text-sm">
                  {summary.recent.map((item) => (
                    <li key={item.id}>
                      {new Date(item.createdAt).toLocaleTimeString("es-PE", {
                        timeZone: "America/Lima",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {item.action === "ENTRY"
                        ? "Ingreso"
                        : item.action === "REENTRY"
                          ? "Reingreso"
                          : "Salida"}{" "}
                      · {item.operator}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">Aún no hay movimientos.</p>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
