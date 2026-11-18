"use client";
import { useEffect, useState, type FormEvent } from "react";
import { EMPTY_WELCOME_ATTRACT, WELCOME_ATTRACT_IDLE_MS, WELCOME_ATTRACT_IMAGE_MAX_BYTES, WELCOME_ATTRACT_VIDEO_MAX_BYTES, type WelcomeAttractConfig, type WelcomeAttractImageEffect } from "@/lib/welcomeplayers/attract";
import effects from "./attractEffects.module.css";

export function AttractSettings() {
  const [config, setConfig] = useState<WelcomeAttractConfig>(EMPTY_WELCOME_ATTRACT);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/welcomeplayers/attract", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se pudo cargar la configuración.");
        setConfig(result.config);
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message || "No se pudo cargar la configuración."); });
    return () => controller.abort();
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file || busy) return;
    const max = file.type.startsWith("image/") ? WELCOME_ATTRACT_IMAGE_MAX_BYTES : WELCOME_ATTRACT_VIDEO_MAX_BYTES;
    if (file.size > max) { setError("El archivo supera el tamaño permitido."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("media", file);
      const response = await fetch("/api/admin/welcomeplayers/attract", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo guardar el archivo.");
      setConfig(result.config); setFile(null); formElement.reset(); setMessage("Pantalla de bienvenida actualizada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el archivo."); }
    finally { setBusy(false); }
  }
  async function updateSettings(patch: { enabled?: boolean; imageEffect?: WelcomeAttractImageEffect }) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/welcomeplayers/attract", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo actualizar la pantalla.");
      setConfig(result.config); setMessage(patch.imageEffect !== undefined ? "Efecto actualizado." : result.config.enabled ? "Pantalla activada." : "Pantalla desactivada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar la pantalla."); }
    finally { setBusy(false); }
  }

  return <section className="min-w-0 rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:p-5">
    <h2 className="text-lg font-semibold">Pantalla de bienvenida</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Muestra una imagen o video vertical hasta que alguien toque la pantalla. Vuelve después de {WELCOME_ATTRACT_IDLE_MS / 1000} segundos sin actividad.</p>
    <div className="mt-4 flex flex-wrap items-start gap-4">
      {config.url && <div className="relative aspect-[9/16] w-24 overflow-hidden rounded-lg bg-slate-950 sm:w-28">{config.mediaType === "video" ? <video src={config.url} muted playsInline loop autoPlay className="h-full w-full object-contain" /> : <><img src={config.url} alt="Pantalla de bienvenida actual" className={`h-full w-full object-contain ${config.imageEffect === "bounce" ? effects.bounce : config.imageEffect === "heartbeat" ? effects.heartbeat : ""}`} />{config.imageEffect === "lights" && <span aria-hidden="true" className={`absolute inset-0 ${effects.lights}`} />}</>}</div>}
      <div className="min-w-0 flex-1 basis-48 space-y-3">
        <p className="text-sm">{config.url ? config.enabled ? "Activa" : "Desactivada" : "Sin imagen ni video"}</p>
        {config.url && <button type="button" disabled={busy} onClick={() => updateSettings({ enabled: !config.enabled })} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold disabled:opacity-50">{config.enabled ? "Desactivar" : "Activar"}</button>}
        {config.url && config.mediaType === "image" && <label className="block text-sm font-medium">Efecto de la imagen<select value={config.imageEffect || "none"} disabled={busy} onChange={(event) => updateSettings({ imageEffect: event.target.value as WelcomeAttractImageEffect })} className="mt-1 block w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:bg-slate-800 disabled:opacity-50"><option value="none">Sin efecto</option><option value="bounce">Rebote</option><option value="heartbeat">Latido</option><option value="lights">Luces</option></select></label>}
        <form onSubmit={upload} className="space-y-2">
          <label className="block text-sm font-medium">Cambiar imagen o video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full min-w-0 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-white" /></label>
          <p className="text-xs text-slate-500 dark:text-slate-400">Formato vertical 9:16. Imágenes hasta {WELCOME_ATTRACT_IMAGE_MAX_BYTES / 1024 / 1024} MB; MP4 o WebM hasta {WELCOME_ATTRACT_VIDEO_MAX_BYTES / 1024 / 1024} MB. El video se reproduce sin sonido.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Para un tótem lento, una imagen suele consumir menos recursos que un video.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Incluye en el diseño la indicación «Toca para jugar»; toda la pantalla responde al toque.</p>
          <button type="submit" disabled={!file || busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar pantalla"}</button>
        </form>
      </div>
    </div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
  </section>;
}
