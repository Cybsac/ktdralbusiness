"use client";
import { useEffect, useState } from "react";

import { gameCatalogUrl, prizeRequest } from "./api";
export function PrizeStockEditor({
  prizeId,
  stock,
  onSaved,
}: {
  prizeId: string;
  stock: number | null;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(stock === null ? "" : String(stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(stock === null ? "" : String(stock)), [stock]);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Stock del premio"
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input w-24 min-w-0"
          required
        />
        <button
          className="btn btn-outline text-xs"
          disabled={busy}
          onClick={async () => {
            const n = Number(value);
            if (value === "" || !Number.isSafeInteger(n) || n < 0) {
              setError("Stock inválido");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await prizeRequest(gameCatalogUrl(`/api/prizes/${prizeId}`), {
                method: "PATCH",
                body: JSON.stringify({ stock: n }),
              });
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo guardar");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
