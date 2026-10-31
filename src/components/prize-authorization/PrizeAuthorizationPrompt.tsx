"use client";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { PRIZE_AUTH_EVENT, type PrizeAuthorizationRequest } from "@/lib/prize-authorization/client";

import { PRIZE_CODE_DIGITS, PRIZE_CODE_PATTERN } from "@/lib/prize-authorization/code-format";

const canceled = () =>
  new Response(
    JSON.stringify({
      code: "PRIZE_OTP_CANCELED",
      message: "Entrega cancelada.",
      error: "Entrega cancelada.",
    }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
export function PrizeAuthorizationPrompt() {
  const [request, setRequest] = useState<PrizeAuthorizationRequest | null>(null);
  const pending = useRef<PrizeAuthorizationRequest | null>(null);
  const queue = useRef<PrizeAuthorizationRequest[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const requests = queue.current;
    const listener = (event: Event) => {
      const next = (event as CustomEvent<PrizeAuthorizationRequest>).detail;
      if (pending.current) {
        requests.push(next);
        return;
      }
      pending.current = next;
      setCode("");
      setError("");
      setRequest(next);
    };
    window.addEventListener(PRIZE_AUTH_EVENT, listener);
    return () => {
      window.removeEventListener(PRIZE_AUTH_EVENT, listener);
      pending.current?.resolve(canceled());
      pending.current = null;
      requests.splice(0).forEach((item) => item.resolve(canceled()));
    };
  }, []);
  useEffect(() => {
    if (request && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [request]);
  function finish(response: Response) {
    pending.current?.resolve(response);
    if (!response.ok) queue.current.splice(0).forEach((item) => item.resolve(canceled()));
    const next = queue.current.shift() ?? null;
    pending.current = next;
    setRequest(next);
    setCode("");
    setError("");
    setBusy(false);
    if (!next) dialog.current?.close();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await request.submit(code);
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      if (["PRIZE_OTP_INVALID", "PRIZE_OTP_REQUIRED", "PRIZE_OTP_LOCKED"].includes(body?.code)) {
        setError(body.message);
        setCode("");
        setBusy(false);
        return;
      }
      finish(response);
    } catch {
      setError("No se pudo conectar. Verifica el estado del premio antes de reintentar.");
      setBusy(false);
    }
  }
  if (!request) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="prize-otp-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) finish(canceled());
      }}
      className="w-[calc(100%_-_2rem)] max-w-sm max-h-[calc(100dvh_-_2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-500 bg-white p-4 sm:p-6 text-slate-900 shadow-2xl backdrop:bg-black/70 dark:bg-slate-900 dark:text-white"
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 id="prize-otp-title" className="text-xl font-semibold">
          Autorizar entrega
        </h2>
        <p className="text-sm">
          El colaborador debe ingresar su clave personal. La entrega quedará registrada a su nombre.
        </p>
        <label className="block text-sm">
          Clave de {PRIZE_CODE_DIGITS} dígitos
          <input
            autoFocus
            required
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern={PRIZE_CODE_PATTERN}
            maxLength={PRIZE_CODE_DIGITS}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={busy}
            className="mt-2 block w-full rounded-lg border border-slate-400 bg-transparent p-3 text-center text-2xl tracking-[0.35em]"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="btn min-h-11 min-w-0 sm:flex-1"
            disabled={busy || code.length !== PRIZE_CODE_DIGITS}
            type="submit"
          >
            {busy ? "Confirmando…" : "Confirmar entrega"}
          </button>
          <button
            className="btn-outline min-h-11 min-w-0"
            disabled={busy}
            type="button"
            onClick={() => finish(canceled())}
          >
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  );
}
