"use client";
import { useEffect, useState } from "react";

import type { NewsSnapshot } from "@/lib/internal-news/revisions";

interface Revision {
  id: string;
  version: number;
  createdAt: string;
  assignmentCount: number;
  snapshot: NewsSnapshot;
}
export function NewsRevisionHistory({ setId, onClose }: { setId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/trivia/question-sets/${encodeURIComponent(setId)}/revisions?page=${page}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.message || "No se pudo cargar el historial");
        return data.data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows((prev) => (page === 1 ? data.revisions : [...prev, ...data.revisions]));
        setMore(data.hasMore);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setId, page]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Historial de revisiones"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Revisiones asignadas</h2>
          <button type="button" onClick={onClose} className="btn">
            Cerrar
          </button>
        </div>
        <p className="mb-3 text-sm">
          Cada revisión conserva el contenido enviado. Las ediciones del borrador no cambian estas
          copias.
        </p>
        {rows.map((row) => (
          <details key={row.id} className="mb-3 rounded border border-slate-400 p-3">
            <summary className="cursor-pointer break-words">
              v{row.version} · {row.snapshot.name} · {row.assignmentCount} asignaciones ·{" "}
              {new Date(row.createdAt).toLocaleString()}
            </summary>
            <div
              className="mt-3 break-words [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: row.snapshot.regulationContent || "" }}
            />
            {row.snapshot.questions.map((q) => (
              <div key={q.id} className="mt-3">
                <p className="font-medium">{q.question}</p>
                <ul>
                  {q.answers.map((a) => (
                    <li key={a.id}>
                      {a.isCorrect ? "✓ " : ""}
                      {a.answer}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        ))}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        {loading && <p>Cargando…</p>}
        {!loading && !error && !rows.length && <p>Aún no hay revisiones asignadas.</p>}
        {more && (
          <button
            type="button"
            disabled={loading}
            className="btn"
            onClick={() => setPage(page + 1)}
          >
            Cargar más revisiones
          </button>
        )}
      </section>
    </div>
  );
}
