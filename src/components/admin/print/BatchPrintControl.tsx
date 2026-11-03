"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  PRINT_CONTROL_POLICY as P,
  type PrintBatchKind,
  type PrintBatchSummary as Batch,
} from "@/lib/print/control-policy";

function batchLabel(batch: Batch): string {
  const name = (batch.description || "").trim();
  if (name) return name;
  const date = new Date(batch.createdAt || "");
  return Number.isNaN(date.getTime())
    ? batch.id
    : `Batch ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export function BatchPrintControl({ kind, backHref }: { kind: PrintBatchKind; backHref: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequest = useRef(0);
  const previewAbort = useRef<AbortController | null>(null);
  const pdfAbort = useRef<AbortController | null>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const generatingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function load() {
      try {
        const preselected = new URL(window.location.href).searchParams.get("preselect");
        const query = new URLSearchParams({ kind });
        if (preselected) query.set("preselect", preselected);
        const response = await fetch(`/api/admin/print/batches?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Error al cargar los lotes");
        const result = await response.json();
        const items: Batch[] = result.data;
        if (!mounted) return;
        setBatches(items);
        if (preselected && items.some((batch) => batch.id === preselected))
          setSelectedBatchId(preselected);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error al cargar los lotes");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [kind]);

  useEffect(
    () => () => {
      previewRequest.current++;
      previewAbort.current?.abort();
      pdfAbort.current?.abort();
      downloads.current.forEach((timer, url) => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      });
      downloads.current.clear();
    },
    []
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  useEffect(() => {
    if (!file || (kind === "static" && !selectedBatchId)) {
      previewAbort.current?.abort();
      previewRequest.current++;
      setPreview(null);
      setPreviewing(false);
      return;
    }
    const controller = new AbortController();
    previewAbort.current?.abort();
    previewAbort.current = controller;
    const request = ++previewRequest.current;
    setPreview(null);
    setError(null);
    setPreviewing(true);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    if (selectedBatchId) form.append("batchId", selectedBatchId);
    void (async () => {
      try {
        const response = await fetch("/api/print/control/preview", { method: "POST", body: form, signal: controller.signal });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || "No se pudo generar la vista previa.");
        }
        const blob = await response.blob();
        if (!controller.signal.aborted && request === previewRequest.current) setPreview(URL.createObjectURL(blob));
      } catch (err) {
        if (!controller.signal.aborted && request === previewRequest.current) setError(err instanceof Error ? err.message : "Error al generar la vista previa");
      } finally {
        if (request === previewRequest.current) setPreviewing(false);
      }
    })();
    return () => controller.abort();
  }, [file, kind, selectedBatchId]);

  function selectTemplate(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!P.imageTypes.some((type) => type === selected.type) || selected.size > P.maxTemplateBytes) {
      setFile(null);
      setError("Selecciona una imagen PNG, JPG o WebP de hasta 10 MB.");
      return;
    }
    setFile(selected);
  }

  async function generatePdf() {
    if (!file || !selectedBatchId || generatingRef.current) return;
    generatingRef.current = true;
    const controller = new AbortController();
    pdfAbort.current = controller;
    setError(null);
    setGenerating(true);
    try {
      const form = new FormData();
      form.append("batchId", selectedBatchId);
      form.append("file", file);
      const response = await fetch("/api/print/control/pdf", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "No se pudo generar el PDF");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const pdf = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pdf;
      link.download = `batch-${selectedBatchId}.pdf`;
      link.click();
      previewAbort.current?.abort();
      previewRequest.current++;
      setPreviewing(false);
      setFile(null);
      setPreview(null);
      downloads.current.set(
        pdf,
        setTimeout(() => {
          URL.revokeObjectURL(pdf);
          downloads.current.delete(pdf);
        }, P.downloadReleaseMs)
      );
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Error al generar el PDF");
    } finally {
      generatingRef.current = false;
      if (!controller.signal.aborted) setGenerating(false);
    }
  }

  if (loading) return <div className="flex justify-center p-8 text-white">Cargando datos...</div>;
  return (
    <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 border border-slate-200 dark:border-slate-700">
      <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">
        Control de Impresión Centralizado
      </h2>
      <p className="text-slate-400 mb-4">
        Genera un PDF con los códigos QR del lote y la plantilla seleccionada.
      </p>
      {error && (
        <div className="bg-red-900/30 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>
      )}
      <label
        htmlFor="batch"
        className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
      >
        Seleccionar lote
      </label>
      <select
        id="batch"
        className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-white mb-6"
        disabled={generating}
        value={selectedBatchId}
        onChange={(event) => setSelectedBatchId(event.target.value)}
      >
        <option value="">Seleccione un lote</option>
        {batches.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batchLabel(batch)} (Total: {batch.total}, Imprimibles: {batch.printable})
          </option>
        ))}
      </select>
      <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <label
          htmlFor="template"
          className="block text-lg font-medium text-slate-800 dark:text-slate-300 mb-3"
        >
          Seleccionar plantilla
        </label>
        <input
          id="template"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={generating}
          onChange={selectTemplate}
          className="block w-full text-slate-700 dark:text-slate-300"
        />
        {file && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{file.name}</p>}
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
          La imagen se usa únicamente para esta generación. PNG, JPG o WebP, máximo 10 MB. {kind === "static" && !selectedBatchId && " Selecciona un lote para ver su premio en la vista previa."}
        </p>
      </div>
      {(preview || previewing) && (
        <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-300 mb-3">
            Vista previa con QR de ejemplo
          </h3>
          <div className="flex justify-center bg-slate-100 dark:bg-slate-950 p-2 rounded-lg min-h-32">
            {previewing ? (
              <span>Generando vista previa...</span>
            ) : (
              preview && (
                <img
                  src={preview}
                  alt="Vista previa de la plantilla con QR"
                  className="h-auto max-h-64 max-w-full object-contain"
                />
              )
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 text-center">
            La posición del QR representa su ubicación en la impresión final. {kind === "static" && "Se muestra un premio del lote; cada pulsera llevará el premio asociado a su propio QR."}
          </p>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-3 mt-8">
        <Link href={backHref} className="px-4 py-2 bg-slate-700 text-slate-200 rounded">
          Volver a Lotes
        </Link>
        <button
          onClick={generatePdf}
          disabled={generating || !selectedBatchId || !file}
          className="px-4 py-2 rounded bg-brand-600 text-white disabled:opacity-50"
        >
          {generating ? "Generando..." : "Generar PDF"}
        </button>
      </div>
    </div>
  );
}
