"use client";
import { usePersonalPrizeCode } from "@/components/prize-authorization/PersonalPrizeCodeProvider";

export default function MyPrizeCodePage() {
  const { data, error } = usePersonalPrizeCode();
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
