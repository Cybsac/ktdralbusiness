"use client";
import { useState } from "react";

import type { AdminPrize } from "@/lib/prize-games/admin-types";
import { GAME_RESULT_KEYS } from "@/lib/prize-games/contracts";

import { gameCatalogUrl, prizeRequest } from "./api";
export function PrizeCatalog({
  prizes,
  onEdit,
  onSaved,
}: {
  prizes: AdminPrize[];
  onEdit: (_prize: AdminPrize) => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const visible = prizes.filter(
    (prize) => !Object.values(GAME_RESULT_KEYS).some((key) => key === prize.key)
  );
  return (
    <section className="card">
      <div className="card-header flex flex-wrap justify-between gap-3">
        <h2>Catálogo de premios</h2>
      </div>
      <div className="card-body space-y-3">
        {visible.map((prize) => (
          <div
            key={prize.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="break-words font-semibold">{prize.label}</h3>
                {!prize.active && <span className="text-xs text-slate-500">Inactivo</span>}
              </div>
              <p className="mt-2 text-sm">
                Stock disponible: <strong>{prize.stock ?? "Pendiente de definir"}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline text-xs" onClick={() => onEdit(prize)}>
                Editar
              </button>
              <button
                className="btn btn-outline text-xs text-red-500"
                disabled={
                  !!deleting ||
                  prize.hasTokens ||
                  Object.values(GAME_RESULT_KEYS).some((key) => key === prize.key)
                }
                onClick={async () => {
                  if (!window.confirm(`¿Eliminar el premio sin uso “${prize.label}”?`)) return;
                  setDeleting(prize.id);
                  setError(null);
                  try {
                    await prizeRequest(gameCatalogUrl(`/api/prizes/${prize.id}`), {
                      method: "DELETE",
                    });
                    await onSaved();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  } finally {
                    setDeleting(null);
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {!visible.length && (
          <p>Aún no preparaste premios en el catálogo. Crea un premio e indica su stock.</p>
        )}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
