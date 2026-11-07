"use client";
import { useRef, useState } from "react";

import { PublicChallenge } from "./PublicChallenge";

type Props = {
  dni: string;
  isPublic?: boolean;
  onResult: (value: {
    name: string;
    birthday: string | null;
    displayName?: string;
    birthdayIdentityProof?: string | null;
  }) => void;
};
export function BirthdayIdentityLookup({ dni, isPublic = false, onResult }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const current = useRef(dni);
  current.current = dni;
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
        isPublic && result.birthday && !result.birthdayIdentityProof
          ? "No pudimos validar tus datos. Inténtalo más tarde o contacta al equipo."
          : result.birthday
            ? "Listo, completamos tus datos. Revísalos antes de continuar."
            : isPublic
              ? "No pudimos obtener la fecha de nacimiento. Contacta al equipo para realizar tu reserva."
              : "Completa tu fecha de nacimiento para continuar."
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
      <button
        type="button"
        onClick={search}
        disabled={busy || !/^\d{8}$/.test(dni) || (isPublic && !token)}
        className={
          isPublic
            ? "min-h-11 w-full rounded-xl border border-orange-400/50 bg-orange-400/10 px-4 py-2.5 text-sm font-semibold text-orange-100 transition hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            : "rounded border px-3 py-2 text-sm disabled:opacity-50"
        }
      >
        {busy ? "Completando datos…" : isPublic ? "Continuar" : "Buscar DNI"}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
