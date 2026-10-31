"use client";
import { useEffect, useState } from "react";

import { prizeRequest } from "@/components/admin/prizes/api";
import { BatchGenerator } from "@/components/admin/prizes/BatchGenerator";
import { PrizeCatalog } from "@/components/admin/prizes/PrizeCatalog";
import { PrizeForm } from "@/components/admin/prizes/PrizeForm";
import { RecentBatches } from "@/components/admin/prizes/RecentBatches";
import { SystemPrizeControls } from "@/components/admin/prizes/SystemPrizeControls";
import { PrizeAuthorizationLink } from "@/components/prize-authorization/PrizeAuthorizationLink";
import type { AdminPrize, PrizeAdminData } from "@/lib/prize-games/admin-types";
export default function PrizesClient({ initialData }: { initialData: PrizeAdminData }) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState<AdminPrize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => setData(initialData), [initialData]);
  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await prizeRequest<PrizeAdminData>("/api/prizes/overview");
      setData(next);
      setEditing((current) =>
        current && next.prizes.some((prize) => prize.id === current.id) ? current : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
      throw e;
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Gestionar premios · Tokenshow</h1>
        <button
          className="btn btn-outline"
          disabled={refreshing}
          onClick={() => void refresh().catch(() => {})}
        >
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      <PrizeAuthorizationLink />
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      <SystemPrizeControls prizes={data.prizes} onSaved={refresh} />
      <PrizeForm editing={editing} onCancel={() => setEditing(null)} onSaved={refresh} />
      <PrizeCatalog
        prizes={data.prizes}
        onEdit={(prize) => {
          setEditing(prize);
          document
            .getElementById("prize-form")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onSaved={refresh}
      />
      <BatchGenerator prizes={data.prizes} calendar={data.calendar} onSaved={refresh} />
      <RecentBatches batches={data.batches} timeZone={data.calendar.timeZone} />
    </div>
  );
}
