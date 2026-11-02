"use client";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { usePersonalPrizeCode } from "./PersonalPrizeCodeProvider";

export function PersonalPrizeCodeHeader() {
  const { data, error } = usePersonalPrizeCode();
  return (
    <Link
      href="/u/prize-authorization"
      className="mt-2 flex min-w-0 items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 transition-colors hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/60"
      aria-label="Mi OTP personal de canjes"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"><ShieldCheck aria-hidden="true" size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">Mi código de canjes</span>
        <span className="mt-0.5 block text-[11px] leading-tight text-sky-700 dark:text-sky-300">
          {data?.enabled && data.code
            ? data.publicRedemptionOpen ? "Personal · No compartas tu clave" : "Canje público fuera de vigencia"
            : error ? "Consultar disponibilidad" : data ? "No habilitado" : "Consultando…"}
        </span>
      </span>
      {data?.enabled && data.code ? (
        <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 font-mono text-lg font-bold tracking-[0.15em] text-sky-900 shadow-sm dark:bg-slate-900 dark:text-sky-100">{data.code}</span>
      ) : null}
      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-sky-500" />
    </Link>
  );
}
