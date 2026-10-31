"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePrizeAuthorizationRefresh } from "@/hooks/usePrizeAuthorizationRefresh";

interface PersonalPrizeCode {
  enabled: boolean;
  code: string | null;
  name: string | null;
  validUntil: string | null;
  publicRedemptionOpen: boolean;
  timezone: string;
}
const PersonalCodeContext = createContext<{ data: PersonalPrizeCode | null; error: string } | null>(
  null
);
export function PersonalPrizeCodeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PersonalPrizeCode | null>(null);
  const [error, setError] = useState("");
  usePrizeAuthorizationRefresh(
    async (signal) => {
      try {
        const response = await fetch("/api/user/prize-authorization", {
          cache: "no-store",
          signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "No se pudo consultar tu clave");
        if (!signal.aborted) {
          setData(body);
          setError("");
        }
      } catch (error) {
        if (!signal.aborted) {
          setData(null);
          setError(error instanceof Error ? error.message : "No se pudo consultar tu clave");
        }
      }
    },
    data?.validUntil,
    () => setData(null)
  );
  return (
    <PersonalCodeContext.Provider value={{ data, error }}>{children}</PersonalCodeContext.Provider>
  );
}
export function usePersonalPrizeCode() {
  const value = useContext(PersonalCodeContext);
  if (!value) throw new Error("PersonalPrizeCodeProvider is required");
  return value;
}
