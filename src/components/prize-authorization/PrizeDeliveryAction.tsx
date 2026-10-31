"use client";

import type { MouseEventHandler } from "react";

import { usePrizeOperatorSession } from "@/hooks/usePrizeOperatorSession";

type PrizeDeliveryActionProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  busy?: boolean;
  authenticated?: boolean;
};

/** Session-aware presentation; authorization remains in the delivery handler. */
export function PrizeDeliveryAction({
  onClick,
  disabled = false,
  busy = false,
  authenticated,
}: PrizeDeliveryActionProps) {
  const operatorSession = usePrizeOperatorSession(authenticated === undefined);
  const operational = authenticated ?? operatorSession;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className={
        operational
          ? "inline-flex min-h-11 w-full max-w-full min-w-0 items-center justify-center whitespace-normal break-words rounded-xl bg-emerald-600 px-5 py-3 text-center text-base font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex max-w-full min-w-0 whitespace-normal break-words text-center min-h-11 items-center justify-center rounded-md px-2 py-2 text-sm font-normal text-current opacity-60 underline decoration-current/40 underline-offset-4 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {busy
        ? "Registrando entrega…"
        : operational
          ? "Registrar entrega"
          : "Personal: registrar entrega"}
    </button>
  );
}
