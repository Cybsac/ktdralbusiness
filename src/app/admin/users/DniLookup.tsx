"use client";
import { Button } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

type Applied = { dni: string; previous: Record<string, unknown>; filled: Record<string, unknown> };
export function DniLookup() {
  const { control, setValue, getValues } = useFormContext();
  const dni = useWatch({ control, name: "dni" });
  const documentType = useWatch({ control, name: "documentType" });
  const applied = useRef<Applied | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  useEffect(() => {
    const previous = applied.current;
    if (!previous || (documentType === "DNI" && String(dni || "").trim() === previous.dni)) return;
    applied.current = null;
    for (const key of Object.keys(previous.filled)) {
      if (getValues(key) === previous.filled[key])
        setValue(key, previous.previous[key], { shouldDirty: true, shouldValidate: true });
    }
    setMessage("El documento cambió; se retiraron los datos completados por la consulta.");
  }, [dni, documentType, getValues, setValue]);
  async function search() {
    const value = String(dni || "").trim();
    if (documentType !== "DNI" || !/^\d{8}$/.test(value)) {
      setMessage("Selecciona DNI peruano e ingresa 8 dígitos.");
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users/dni-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: value, documentType: "DNI" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo consultar el DNI");
      if (
        id !== requestId.current ||
        String(getValues("dni") || "").trim() !== value ||
        getValues("documentType") !== "DNI"
      )
        return;
      const filled: Record<string, unknown> = { personName: result.name };
      if (result.birthday) filled.birthday = result.birthday;
      if (result.documentSexCode) filled.documentSexCode = result.documentSexCode;
      if (!getValues("username")) filled.username = value;
      const previous = Object.fromEntries(Object.keys(filled).map((key) => [key, getValues(key)]));
      applied.current = { dni: value, previous, filled };
      for (const [key, newValue] of Object.entries(filled))
        setValue(key, newValue, { shouldDirty: true, shouldValidate: true });
      setMessage("Datos encontrados. Revisa la información antes de guardar.");
    } catch (error) {
      if (id === requestId.current)
        setMessage(error instanceof Error ? error.message : "No se pudo consultar el DNI");
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  return (
    <div>
      <Button
        type="button"
        variant="outlined"
        disabled={busy || documentType !== "DNI"}
        onClick={search}
      >
        {busy ? "Consultando…" : "Buscar DNI"}
      </Button>
      {documentType !== "DNI" && (
        <p className="mt-2 text-sm">La consulta está disponible solo para DNI peruano.</p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
