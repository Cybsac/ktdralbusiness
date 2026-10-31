"use client";
import { useState } from "react";

import { usePrizeAuthorizationRefresh } from "@/hooks/usePrizeAuthorizationRefresh";

export default function MyPrizeCodePage() {
  const [data, setData] = useState<{
    enabled: boolean;
    code: string | null;
    name: string | null;
    validUntil: string | null;
    publicRedemptionOpen: boolean;
    timezone: string;
  } | null>(null);
  const [error, setError] = useState("");
  usePrizeAuthorizationRefresh(
    async (signal) => {
      try {
        const res = await fetch("/api/user/prize-authorization", { cache: "no-store", signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || "No se pudo consultar tu clave");
        if (!signal.aborted) {
          setData(body);
          setError("");
        }
      } catch (e: any) {
        if (!signal.aborted) {
          setData(null);
          setError(e.message);
        }
      }
    },
    data?.validUntil,
    () => setData(null)
  );
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <a href="/u" className="text-sm underline">
        Volver
      </a>
      <h1 className="text-2xl font-bold">Mi clave de canjes</h1>
      <p className="text-sm">
        Úsala para autorizar una entrega en el teléfono de un cliente. La entrega quedará registrada
        a tu nombre. Con tu propia sesión activa no necesitas escribirla.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <section className="rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold">{data.name || "Tu clave personal"}</h2>
          {data.enabled ? (
            <>
              <div className="font-mono text-4xl tracking-[0.3em]">{data.code}</div>
              <p className="text-sm">
                Cambia:{" "}
                {data.validUntil
                  ? new Date(data.validUntil).toLocaleString("es-PE", { timeZone: data.timezone })
                  : "cuando administración la reemplace"}
              </p>
              {!data.publicRedemptionOpen && (
                <p className="text-sm">El canje público está fuera de la vigencia habilitada.</p>
              )}
              <p className="text-sm">
                No compartas tu clave. Cada uso identifica tu cuenta como responsable.
              </p>
            </>
          ) : (
            <p>Tu clave no está habilitada. Solicita su activación a administración.</p>
          )}
        </section>
      )}
    </div>
  );
}
