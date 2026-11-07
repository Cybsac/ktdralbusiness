"use client";
import { useEffect, useState } from "react";

export function BirthdayTemplateSettings() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("template", file);
      const res = await fetch("/api/admin/birthdays/template", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "No se pudo guardar la plantilla");
      setFile(null);
      setVersion(Date.now());
      setMessage("Plantilla actualizada. Puedes regenerar manualmente las tarjetas guardadas.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la plantilla");
    } finally {
      setBusy(false);
    }
  }
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return (
    <section className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
      <h2 className="font-semibold text-lg">Plantilla de invitación</h2>
      <p className="text-sm">
        Sube una imagen vertical 9:16, de al menos 1080 × 1920 píxeles (JPG, PNG o WebP; máximo 10
        MB). La nueva plantilla reemplaza la anterior. Deja espacio para el QR en la parte superior
        y el nombre y fecha en la parte inferior.
      </p>
      <div className="flex flex-wrap gap-4 items-start">
        <div>
          <p className="text-sm">Plantilla actual</p>
          {base && (
            <img
              key={version}
              className="w-32 rounded"
              src={`${base}/storage/v1/object/public/birthday-templates/newversioncard.webp?v=${version}`}
              alt="Plantilla actual"
            />
          )}
        </div>
        {preview && (
          <div>
            <p className="text-sm">Nueva plantilla</p>
            <img className="w-32 rounded" src={preview} alt="Vista previa de la nueva plantilla" />
          </div>
        )}
      </div>
      <input
        key={version}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Seleccionar plantilla"
        onChange={(event) => {
          setFile(event.target.files?.[0] || null);
          setMessage("");
          setFailed(false);
        }}
      />
      <button
        type="button"
        className="btn px-4 py-2"
        disabled={!file || busy}
        onClick={async () => {
          setFailed(false);
          await save();
        }}
      >
        {busy ? "Guardando…" : "Reemplazar plantilla"}
      </button>
      {message && (
        <p role={failed ? "alert" : "status"} className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
