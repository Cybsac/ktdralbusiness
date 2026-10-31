import Link from "next/link";

import type { AdminBatch } from "@/lib/prize-games/admin-types";
export function RecentBatches({ batches, timeZone }: { batches: AdminBatch[]; timeZone: string }) {
  const date = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  });
  return (
    <section className="card">
      <div className="card-header">
        <h2>Lotes recientes</h2>
      </div>
      <div className="card-body space-y-3">
        {batches.map((batch) => (
          <article
            key={batch.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="min-w-0 flex-1">
              <h3 className="break-words font-semibold">{batch.name}</h3>
              <dl className="mt-2 space-y-1 text-sm text-slate-500">
                <div>
                  <dt className="inline">Creación: </dt>
                  <dd className="inline">{date.format(new Date(batch.createdAt))}</dd>
                </div>
                <div>
                  <dt className="inline">Vigencia: </dt>
                  <dd className="inline">
                    {batch.validFrom && batch.expiresAt
                      ? `${date.format(new Date(batch.validFrom))} – ${date.format(new Date(batch.expiresAt))}`
                      : "Sin tokens con vigencia definida"}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Cantidad: </dt>
                  <dd className="inline">{batch.tokenCount} tokens</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-outline text-xs" href={`/admin/roulettebatches/${batch.id}`}>
                Ver lote
              </Link>
              <a className="btn btn-outline text-xs" href={`/api/batch/${batch.id}/download?qr=1`}>
                Descargar QR
              </a>
            </div>
          </article>
        ))}
        {!batches.length && <p>Aún no hay lotes.</p>}
        <div className="flex justify-end">
          <Link className="btn btn-outline" href="/admin/roulettebatches">
            Ver todos los lotes
          </Link>
        </div>
      </div>
    </section>
  );
}
