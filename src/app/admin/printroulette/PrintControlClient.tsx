"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Batch = { id: string; description?: string | null; name?: string; createdAt?: string; total: number; printable: number };

function batchLabel(batch: Batch): string {
  const name = (batch.description || batch.name || "").trim();
  if (name) return name;
  const date = new Date(batch.createdAt || "");
  return Number.isNaN(date.getTime()) ? batch.id : `Batch ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export function PrintControlClient() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/print/roulette-batches", { cache: "no-store" });
        if (!response.ok) throw new Error("Error al cargar los lotes");
        const result = await response.json();
        const items: Batch[] = result.data;
        if (!mounted) return;
        setBatches(items);
        const preselected = new URL(window.location.href).searchParams.get("preselect");
        if (preselected && items.some(batch => batch.id === preselected)) setSelectedBatchId(preselected);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error al cargar los lotes");
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; previewRequest.current++; };
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function selectTemplate(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const request = ++previewRequest.current;
    setFile(null);
    setPreview(null);
    setError(null);
    setPreviewing(false);
    if (!IMAGE_TYPES.includes(selected.type) || selected.size > MAX_TEMPLATE_BYTES) {
      setError("Selecciona una imagen PNG, JPG o WebP de hasta 10 MB.");
      return;
    }
    setFile(selected);
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append("file", selected);
      const response = await fetch("/api/print/control/preview", { method: "POST", body: form });
      if (!response.ok) throw new Error("No se pudo generar la vista previa.");
      const blob = await response.blob();
      if (request === previewRequest.current) setPreview(URL.createObjectURL(blob));
    } catch (err) {
      if (request === previewRequest.current) setError(err instanceof Error ? err.message : "Error al generar la vista previa");
    } finally { if (request === previewRequest.current) setPreviewing(false); }
  }

  async function generatePdf() {
    if (!file || !selectedBatchId) return;
    setError(null);
    setGenerating(true);
    try {
      const form = new FormData();
      form.append("batchId", selectedBatchId);
      form.append("file", file);
      const response = await fetch("/api/print/control/pdf", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "No se pudo generar el PDF");
      }
      const pdf = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = pdf;
      link.download = `batch-${selectedBatchId}.pdf`;
      link.click();
      setFile(null);
      setPreview(null);
      setTimeout(() => URL.revokeObjectURL(pdf), 60000);
    } catch (err) { setError(err instanceof Error ? err.message : "Error al generar el PDF"); }
    finally { setGenerating(false); }
  }

  if (loading) return <div className="flex justify-center p-8 text-white">Cargando datos...</div>;
  return (
    <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 border border-slate-200 dark:border-slate-700">
      <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Control de Impresión Centralizado</h2>
      <p className="text-slate-400 mb-4">Genera un PDF con los códigos QR del lote y la plantilla seleccionada.</p>
      {error && <div className="bg-red-900/30 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>}
      <label htmlFor="batch" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Seleccionar lote</label>
      <select id="batch" className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-white mb-6" value={selectedBatchId} onChange={event => setSelectedBatchId(event.target.value)}>
        <option value="">Seleccione un lote</option>
        {batches.map(batch => <option key={batch.id} value={batch.id}>{batchLabel(batch)} (Total: {batch.total}, Imprimibles: {batch.printable})</option>)}
      </select>
      <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <label htmlFor="template" className="block text-lg font-medium text-slate-800 dark:text-slate-300 mb-3">Seleccionar plantilla</label>
        <input id="template" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectTemplate} className="block w-full text-slate-700 dark:text-slate-300" />
        {file && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{file.name}</p>}
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">La imagen se usa únicamente para esta generación. PNG, JPG o WebP, máximo 10 MB.</p>
      </div>
      {(preview || previewing) && <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-300 mb-3">Vista previa con QR de ejemplo</h3>
        <div className="flex justify-center bg-slate-100 dark:bg-slate-950 p-2 rounded-lg min-h-32">{previewing ? <span>Generando vista previa...</span> : preview && <img src={preview} alt="Vista previa de la plantilla con QR" className="h-64 object-contain" />}</div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 text-center">La posición del QR representa su ubicación en la impresión final.</p>
      </div>}
      <div className="flex justify-between mt-8">
        <Link href="/admin/roulettebatches" className="px-4 py-2 bg-slate-700 text-slate-200 rounded">Volver a Lotes</Link>
        <button onClick={generatePdf} disabled={generating || !selectedBatchId || !file} className="px-4 py-2 rounded bg-brand-600 text-white disabled:opacity-50">{generating ? "Generando..." : "Generar PDF"}</button>
      </div>
    </div>
  );
}
