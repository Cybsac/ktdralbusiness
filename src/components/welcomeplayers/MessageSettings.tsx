"use client";
import { useEffect, useState, type FormEvent } from "react";
import { WELCOME_PLAYERS_MESSAGE_MAX_LENGTH } from "@/lib/welcomeplayers/message";

export function MessageSettings() {
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/welcomeplayers/message", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo cargar el mensaje.");
      setMessage(data.message); setSaved(data.message);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo cargar el mensaje."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/welcomeplayers/message", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo guardar el mensaje.");
      setMessage(data.message); setSaved(data.message); setNotice("Mensaje actualizado.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el mensaje."); }
    finally { setBusy(false); }
  }
  return <section className="min-w-0 rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:p-5">
    <h2 className="text-lg font-semibold">Mensaje de la ruleta</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Aparece junto a la ruleta para orientar a los clientes.</p>
    <form onSubmit={save} className="mt-4 space-y-3">
      <label className="block text-sm font-medium">Texto visible<input value={message} onChange={(event) => { setMessage(event.target.value); setNotice(""); }} disabled={loading || busy} maxLength={WELCOME_PLAYERS_MESSAGE_MAX_LENGTH} required className="mt-1 block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 dark:bg-slate-800 disabled:opacity-50" /></label>
      <button type="submit" disabled={loading || busy || !message.trim() || message.trim() === saved} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar mensaje"}</button>
    </form>
    {notice && <p role="status" className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
  </section>;
}
