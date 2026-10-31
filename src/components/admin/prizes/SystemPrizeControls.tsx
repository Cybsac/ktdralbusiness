"use client";
import { useState } from "react";

import type { AdminPrize } from "@/lib/prize-games/admin-types";
import { GAME_RESULT_KEYS } from "@/lib/prize-games/contracts";

import { gameCatalogUrl, prizeRequest } from "./api";
import { PrizeStockEditor } from "./PrizeStockEditor";
export function SystemPrizeControls({
  prizes,
  onSaved,
}: {
  prizes: AdminPrize[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <h2>Premios del sistema</h2>
        <button
          className="btn btn-outline text-xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await prizeRequest(gameCatalogUrl("/api/prizes/ensure-system"), {
                method: "POST",
              });
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparando…" : "Preparar premios del sistema"}
        </button>
      </div>
      <div className="card-body grid gap-4 sm:grid-cols-2">
        {Object.values(GAME_RESULT_KEYS).map((key) => {
          const prize = prizes.find((item) => item.key === key);
          return (
            <div
              key={key}
              className="min-w-0 rounded-lg border border-slate-300 p-3 dark:border-slate-600"
            >
              <h3 className="font-semibold">
                {prize?.label || (key === GAME_RESULT_KEYS.retry ? "Nuevo intento" : "Sin premio")}
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                {key === GAME_RESULT_KEYS.retry
                  ? "Continúa a otra oportunidad, sin entrega física."
                  : "Finaliza el juego sin entrega física."}
              </p>
              {prize ? (
                <>
                  <p className="mb-2 text-sm">
                    Cantidad disponible: <strong>{prize.stock ?? "Pendiente de definir"}</strong>
                  </p>
                  <PrizeStockEditor prizeId={prize.id} stock={prize.stock} onSaved={onSaved} />
                </>
              ) : (
                <p className="text-sm">Usa «Preparar premios del sistema» para configurar su cantidad.</p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
