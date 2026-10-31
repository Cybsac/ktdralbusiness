"use client";
import { useEffect, useState } from "react";

import type { AdminPrize } from "@/lib/prize-games/admin-types";

import { gameCatalogUrl, prizeRequest } from "./api";
const blank = {
  label: "",
  stock: "",
};
export function PrizeForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: AdminPrize | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm(
      editing
        ? {
            label: editing.label,
            stock: editing.stock === null ? "" : String(editing.stock),
          }
        : blank
    );
    setError(null);
  }, [editing]);
  return (
    <form
      id="prize-form"
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const stock = Number(form.stock);
        if (form.stock === "" || !Number.isSafeInteger(stock) || stock < 0) {
          setError("Stock inválido");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await prizeRequest(
            gameCatalogUrl(editing ? `/api/prizes/${editing.id}` : "/api/prizes"),
            {
              method: editing ? "PATCH" : "POST",
              body: JSON.stringify({
                ...form,
                label: form.label.trim(),
                stock,
              }),
            }
          );
          setForm(blank);
          onCancel();
          await onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo guardar");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-header">
        <h2>{editing ? "Editar premio" : "Crear nuevo premio"}</h2>
      </div>
      <div className="card-body grid gap-4 sm:grid-cols-2">
        <label className="block">
          Nombre *
          <input
            required
            maxLength={120}
            className="input mt-1 w-full"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </label>
        <label className="block">
          Stock
          <input
            required
            type="number"
            min={0}
            step={1}
            className="input mt-1 w-full"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
          <span className="text-xs text-slate-500">
            Esta cantidad se utilizará al generar el lote.
          </span>
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
        {editing && (
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button disabled={busy} className="btn">
          {busy ? "Guardando…" : editing ? "Guardar" : "Crear"}
        </button>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}
