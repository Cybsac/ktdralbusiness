"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { PublicChallenge } from "./PublicChallenge";

type Props = {
  dni: string;
  isPublic?: boolean;
  input?: ReactNode;
  onResult: (value: {
    name: string;
    birthday: string | null;
    displayName?: string;
    birthdayIdentityProof?: string | null;
  }) => void;
};
export function BirthdayIdentityLookup({ dni, isPublic = false, input, onResult }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const current = useRef(dni);
  current.current = dni;
  useEffect(() => { setMessage(""); }, [dni]);
  async function search() {
    if (!/^\d{8}$/.test(dni)) {
      setMessage("Ingresa un DNI de 8 dígitos.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        isPublic ? "/api/user/auth/dni-lookup" : "/api/birthdays/dni-lookup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dni,
            documentType: "DNI",
            ...(isPublic ? { challengeToken: token } : {}),
          }),
        }
      );
      const result = await response.json();
      if (current.current !== dni) return;
      if (!response.ok) throw new Error(result.message || "No se pudo consultar el DNI.");
      onResult(result);
      setMessage(
        result.birthday && !result.birthdayIdentityProof
          ? "No pudimos validar tus datos. Inténtalo más tarde o contacta al equipo."
          : result.birthday
            ? "Listo, completamos tus datos. Revísalos antes de continuar."
            : "No pudimos obtener la fecha de nacimiento. Contacta al equipo para realizar la reserva."
      );
    } catch (error) {
      if (current.current === dni)
        setMessage(error instanceof Error ? error.message : "No se pudo consultar el DNI.");
    } finally {
      setBusy(false);
      if (isPublic) {
        setToken("");
        setResetKey((value) => value + 1);
      }
    }
  }
  return (
    <div className="space-y-2">
      {isPublic && (
        <PublicChallenge onToken={setToken} resetKey={resetKey} manualFallback={false} />
      )}
      <div className={input ? "flex min-w-0 items-stretch" : undefined}>
      {input && <div className="min-w-0 flex-1">{input}</div>}
      <button
        type="button"
        onClick={search}
        disabled={busy || !/^\d{8}$/.test(dni) || (isPublic && !token)}
        className={
          input
            ? "min-h-11 shrink-0 rounded-r-lg border border-blue-600 bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            : isPublic
            ? "min-h-11 w-full rounded-xl border border-orange-400/50 bg-orange-400/10 px-4 py-2.5 text-sm font-semibold text-orange-100 transition hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            : "min-h-11 w-full rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        }
      >
        {busy ? (input ? "Buscando…" : "Completando datos…") : input ? "Buscar" : "Continuar"}
      </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
