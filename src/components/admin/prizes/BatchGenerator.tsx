"use client";
import Link from "next/link";
import { useState } from "react";

import { useBatchIssuance } from "@/hooks/useBatchIssuance";
import type { AdminPrize } from "@/lib/prize-games/admin-types";
import type { GameCalendar } from "@/lib/prize-games/calendar";
import { ISSUANCE_POLICY as P } from "@/lib/prize-games/issuance-policy";
import type { IssuanceRequest } from "@/lib/prize-games/issuance-request";

export function BatchGenerator({
  prizes,
  onSaved,
  calendar,
}: {
  prizes: AdminPrize[];
  onSaved: () => Promise<void>;
  calendar: GameCalendar;
}) {
  const [name, setName] = useState("");
  const [experienceType, setExperience] = useState<"roulette" | "scratch_card">("roulette");
  const [mode, setMode] = useState<"byDays" | "singleDay">("byDays");
  const [days, setDays] = useState<number>(P.defaultDays);
  const [date, setDate] = useState("");
  const operation = useBatchIssuance(onSaved);
  const eligible = prizes.filter((prize) => prize.active && prize.gameEnabled && !prize.isReusable);
  const missingStock = eligible.some((prize) => prize.stock === null);
  const total = eligible.reduce((sum, prize) => sum + (prize.stock ?? 0), 0);
  return (
    <section className="card">
      <div className="card-header">
        <h2>Generar lote de QR</h2>
      </div>
      <div className="card-body space-y-4">
        <p className="text-xs text-slate-500">
          Zona horaria: {calendar.timeZone}. Por días, la vigencia comienza al generar el lote. Para
          una fecha específica termina a las {String(calendar.calendarCloseHour).padStart(2, "0")}
          :00 del día siguiente.
        </p>
        {operation.pending && (
          <div className="rounded border border-amber-500/50 p-3">
            <p className="text-sm">
              Hay una emisión pendiente de confirmar. Recupérala con el mismo identificador para
              evitar duplicarla.
            </p>
            <button
              className="btn mt-2"
              disabled={operation.busy}
              onClick={() => operation.issue()}
            >
              {operation.busy ? "Recuperando…" : "Recuperar emisión pendiente"}
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const common = {
              name: name.trim() || "Lote",
              experienceType,
              includeQr: true,
              lazyQr: false,
            };
            const payload: IssuanceRequest =
              mode === "singleDay"
                ? { ...common, mode, singleDayDate: date }
                : { ...common, mode, expirationDays: days };
            void operation.issue(payload);
          }}
        >
          <fieldset
            disabled={operation.busy || !!operation.pending}
            className="space-y-4 disabled:opacity-60"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                Nombre del lote
                <input
                  className="input mt-1 w-full"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Experiencia
                <select
                  className="input mt-1 w-full"
                  value={experienceType}
                  onChange={(e) => setExperience(e.target.value as typeof experienceType)}
                >
                  <option value="roulette">Ruleta</option>
                  <option value="scratch_card">Raspa y gana</option>
                </select>
              </label>
            </div>
            <label className="block">
              Vigencia
              <select
                className="input mt-1 w-full"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="byDays">Por días</option>
                <option value="singleDay">Fecha específica</option>
              </select>
            </label>
            <p className="text-xs text-slate-500">
              Se utilizará todo el stock preparado en el catálogo.
            </p>
            {mode === "byDays" ? (
              <label className="block">
                Cantidad de días
                <input
                  type="number"
                  min={1}
                  max={P.maxValidityDays}
                  required
                  className="input mt-1 w-full"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </label>
            ) : (
              <label className="block">
                Fecha
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input mt-1 w-full"
                />
              </label>
            )}
            {missingStock && (
              <p role="alert" className="text-sm text-amber-500">
                Define un stock numérico para todos los premios antes de generar.
              </p>
            )}
            <p className="text-sm">
              Cantidad a generar: <strong>{total}</strong>
            </p>
            <button className="btn w-full sm:w-auto" disabled={missingStock || total === 0}>
              {operation.busy ? "Generando…" : "Generar lote"}
            </button>
          </fieldset>
        </form>
        {operation.error && (
          <p role="alert" className="text-sm text-red-500">
            {operation.error}
          </p>
        )}
        {operation.receipt && (
          <div role="status" className="rounded border border-emerald-500/50 p-3">
            <p>
              {operation.receipt.reused ? "Emisión recuperada" : "Lote generado"}:{" "}
              {operation.receipt.totalTokens} tokens.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn" href={operation.receipt.downloadUrl}>
                Descargar QR
              </a>
              <Link
                className="btn btn-outline"
                href={`/admin/roulettebatches/${operation.receipt.batchId}`}
              >
                Ver lote
              </Link>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Puedes repetir la descarga sin volver a emitir premios.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
