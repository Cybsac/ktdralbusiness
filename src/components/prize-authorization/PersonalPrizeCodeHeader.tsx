"use client";
import Link from "next/link";
import { usePersonalPrizeCode } from "./PersonalPrizeCodeProvider";

export function PersonalPrizeCodeHeader() {
  const { data, error } = usePersonalPrizeCode();
  return (
    <Link
      href="/u/prize-authorization"
      className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-800 dark:text-sky-200"
      aria-label="Mi OTP personal de canjes"
    >
      <span className="text-xs font-semibold">Mi OTP de canjes</span>
      {data?.enabled && data.code ? (
        <>
          <span className="font-mono text-2xl font-bold tracking-[0.2em]">{data.code}</span>
          <span className="basis-full text-xs">
            {data.publicRedemptionOpen
              ? "Personal · No compartas tu clave"
              : "Canje público fuera de vigencia"}
          </span>
        </>
      ) : (
        <span className="text-xs">
          {error ? "Consultar disponibilidad" : data ? "No habilitado" : "Consultando…"}
        </span>
      )}
    </Link>
  );
}
