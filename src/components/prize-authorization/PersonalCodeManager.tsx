"use client";
import { useState } from "react";

export type PersonalCodeSummary = {
  userId: string;
  username: string;
  name: string | null;
  role: string;
  active: boolean;
  enabled: boolean;
  credentialRevision: number;
  code: string | null;
};
export function PersonalCodeManager({
  collaborators,
  configured,
  onChanged,
}: {
  collaborators: PersonalCodeSummary[];
  configured: boolean;
  onChanged: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(person: PersonalCodeSummary, rotate = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/prize-authorization/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: person.userId,
          enabled: rotate || !person.enabled,
          rotate,
          expectedRevision: person.credentialRevision,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "No se pudo actualizar la clave");
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const shown = collaborators.filter((person) =>
    `${person.name || ""} ${person.username}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <section className="rounded-xl border border-slate-400 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Claves personales de colaboradores</h2>
        <p className="mt-1 text-sm">
          Al guardar la configuración se habilitan las claves de todas las cuentas activas sin
          clave. Cada clave identifica a una sola persona. Revocar una clave impide usarla en
          teléfonos públicos; no bloquea la cuenta ni su sesión.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a href="/u/prize-authorization" className="text-sm underline">
          Consultar mi propia clave
        </a>
      </div>
      {!configured && <p className="text-sm">Guarda primero la configuración general.</p>}
      <label className="block text-sm">
        Buscar colaborador
        <input
          type="search"
          className="mt-1 block w-full rounded border bg-transparent p-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Colaborador</th>
              <th className="p-2">Clave vigente</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => (
              <tr key={person.userId} className="border-t border-slate-300 dark:border-slate-600">
                <td className="p-2">
                  <div className="font-medium">{person.name || person.username}</div>
                  <div className="text-xs opacity-70">
                    {person.username} · {person.role}
                    {!person.active ? " · Cuenta inactiva" : ""}
                  </div>
                </td>
                <td className="p-2 font-mono text-lg tracking-widest">
                  {person.code || (person.enabled && person.active ? "Pendiente" : "—")}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-outline"
                      disabled={busy || !configured || (!person.active && !person.enabled)}
                      onClick={() => void change(person)}
                    >
                      {person.enabled ? "Revocar clave" : "Habilitar clave"}
                    </button>
                    {person.enabled && person.active && (
                      <button
                        className="btn-outline"
                        disabled={busy}
                        onClick={() => void change(person, true)}
                      >
                        Reemplazar clave
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="text-sm">No hay colaboradores que coincidan.</p>}
    </section>
  );
}
