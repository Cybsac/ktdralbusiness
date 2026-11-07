"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { attendanceLabel } from "@/lib/attendance/state-label";

type Role = { id: string; name: string; active: boolean };
type Person = {
  id: string;
  name: string;
  area: string | null;
  jobTitle: string | null;
  active?: boolean;
};
type Assignment = {
  id: string;
  roleId: string;
  personId: string;
  person: Person;
  attendance?: { state: string; firstIn: string | null; lastOut: string | null; justified?: boolean };
};
type History = {
  id: string;
  action: string;
  person: string;
  role: string;
  actor: string;
  createdAt: string;
};
type Roster = {
  day: string;
  currentDay: string;
  canEdit: boolean;
  roles: Role[];
  assignments: Assignment[];
  history: History[];
};

function RoleEditor({
  role,
  busy,
  onSave,
}: {
  role: Role;
  busy: boolean;
  onSave: (name: string, active: boolean) => void;
}) {
  const [name, setName] = useState(role.name);
  useEffect(() => setName(role.name), [role.name]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border p-2">
      <input
        aria-label={`Nombre de ${role.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        maxLength={80}
        className="min-w-0 flex-1 rounded border px-2 py-2 dark:bg-slate-900"
      />
      <button
        type="button"
        disabled={busy || !name.trim() || name.trim() === role.name}
        onClick={() => onSave(name, role.active)}
        className="rounded border px-3 py-2 disabled:opacity-40"
      >
        Guardar
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSave(name, !role.active)}
        className="rounded border px-3 py-2 disabled:opacity-40"
      >
        {role.active ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}
function RoleCard({
  role,
  assignments,
  canEdit,
  busy,
  onAssign,
}: {
  role: Role;
  assignments: Assignment[];
  canEdit: boolean;
  busy: boolean;
  onAssign: (personId: string, active: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [limited, setLimited] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    if (!open || !canEdit || !role.active) return;
    const controller = new AbortController();
    setPeople([]);
    setSearching(true);
    const timer = setTimeout(async () => {
      setSearchError("");
      try {
        const params = new URLSearchParams({ roleId: role.id, q: search });
        const response = await fetch(`/api/roster/people?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se pudo buscar personal");
        if (!controller.signal.aborted) {
          setPeople(result.people);
          setLimited(result.limited);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPeople([]);
          setSearchError(error instanceof Error ? error.message : "No se pudo buscar personal");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, canEdit, role.active, role.id, search]);
  const assigned = new Set(assignments.map((item) => item.personId));
  const available = people.filter((person) => !assigned.has(person.id));
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          {role.name}
          {!role.active && (
            <span className="ml-2 text-xs font-normal text-slate-500">Inactiva</span>
          )}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">
          {assignments.length}
        </span>
      </div>
      {assignments.length ? (
        <ul className="mt-3 space-y-2">
          {assignments.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{item.person.name}</p>
                <p className="text-xs text-slate-500">
                  {[item.person.area, item.person.jobTitle, !item.person.active ? "Inactivo" : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.attendance && (
                  <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    {attendanceLabel(item.attendance.state)}{item.attendance.justified ? " · Justificada" : ""}
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Quitar a ${item.person.name} de ${role.name}`}
                  onClick={() => onAssign(item.personId, false)}
                  className="min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Sin personal asignado.</p>
      )}
      {canEdit && role.active && (
        <details className="mt-3" onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
            + Agregar personal
          </summary>
          <label className="mt-3 block text-sm">
            Buscar colaborador
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, área o cargo"
              className="mt-1 min-h-11 w-full rounded-lg border p-3 text-base dark:bg-slate-900"
            />
          </label>
          <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
            {available.length ? (
              available.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onAssign(person.id, true);
                      setSearch("");
                    }}
                    className="min-h-12 w-full rounded-lg border p-3 text-left disabled:opacity-40"
                  >
                    <span className="block font-medium">{person.name}</span>
                    <span className="text-xs text-slate-500">
                      {[person.area, person.jobTitle].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))
            ) : !searching && !searchError ? (
              <li className="p-2 text-sm text-slate-500">No hay colaboradores disponibles.</li>
            ) : null}
          </ul>
          {searching && <p className="text-xs">Buscando…</p>}
          {searchError && (
            <p role="alert" className="text-xs text-rose-600">
              {searchError}
            </p>
          )}
          {limited && (
            <p className="text-xs text-slate-500">Escribe un nombre para afinar la búsqueda.</p>
          )}
        </details>
      )}
    </section>
  );
}
export function RosterClient({ showManagement = false }: { showManagement?: boolean }) {
  const [data, setData] = useState<Roster | null>(null);
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newRole, setNewRole] = useState("");
  const requestVersion = useRef(0);
  const loadedDay = useRef("");
  const load = useCallback(
    async (selectedDay: string) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/roster?${new URLSearchParams({ ...(selectedDay ? { day: selectedDay } : {}), ...(showManagement ? {} : { history: "0" }) })}`,
          { cache: "no-store" }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "No se pudo cargar la jornada");
        if (version === requestVersion.current) {
          loadedDay.current = result.day;
          setData(result);
          if (!selectedDay) setDay(result.day);
        }
      } catch (reason) {
        if (version === requestVersion.current) {
          setData(null);
          setError(reason instanceof Error ? reason.message : "No se pudo cargar la jornada");
        }
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [showManagement]
  );
  useEffect(() => {
    if (day && loadedDay.current === day) return;
    void load(day);
    return () => {
      requestVersion.current++;
    };
  }, [day, load]);
  async function change(path: string, payload: unknown) {
    if (busy || !day) return false;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "No se pudo guardar");
      await load(day);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const displayed =
    data?.roles.filter(
      (role) => role.active || data.assignments.some((item) => item.roleId === role.id)
    ) || [];
  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Rol de la jornada</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Organiza quién cubre cada función. La asignación no registra asistencia.
        </p>
      </header>
      <div className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border p-3 sm:p-4">
        <label className="min-w-0 flex-1 text-sm font-semibold sm:flex-none">
          Jornada
          <input
            type="date"
            value={day}
            disabled={busy || loading}
            onChange={(e) => {
              if (e.target.value) {
                setData(null);
                setDay(e.target.value);
              }
            }}
            className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border px-2 py-2 text-base dark:bg-slate-900 sm:w-auto"
          />
        </label>
        <button
          type="button"
          disabled={busy || loading || !data || day === data.currentDay}
          onClick={() => {
            if (data) {
              setData(null);
              setDay(data.currentDay);
            }
          }}
          className="min-h-11 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
        >
          Jornada actual
        </button>
        <p className="text-xs text-slate-500">
          La jornada continúa después de medianoche hasta el corte configurado.
        </p>
      </div>
      {error && (
        <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-rose-800">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load(day)}>
            Reintentar
          </button>
        </div>
      )}
      {loading && <p role="status">Cargando jornada…</p>}
      {data && (
        <>
          {!data.canEdit && (
            <p className="text-sm text-slate-500">
              Consulta del equipo asignado. Administración y coordinación pueden realizar cambios.
            </p>
          )}
          {data.canEdit && (
            <p role="status" className="text-xs text-slate-500">
              {busy ? "Guardando cambios…" : "Los cambios se guardan automáticamente."}
            </p>
          )}
          <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {displayed.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                assignments={data.assignments.filter((item) => item.roleId === role.id)}
                canEdit={data.canEdit}
                busy={busy}
                onAssign={(personId, active) =>
                  void change("/api/roster/assignments", { day, personId, roleId: role.id, active })
                }
              />
            ))}
          </div>
          {!displayed.length && (
            <p className="text-sm text-slate-500">No hay funciones disponibles.</p>
          )}
          {data.canEdit && showManagement && (
            <>
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">Gestionar funciones</summary>
                <p className="mt-2 text-sm text-slate-500">
                  Puedes añadir, renombrar o desactivar funciones. Las asignaciones anteriores se
                  conservan.
                </p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await change("/api/roster/roles", { action: "create", name: newRole }))
                      setNewRole("");
                  }}
                >
                  <input
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    disabled={busy}
                    maxLength={80}
                    placeholder="Nueva función"
                    aria-label="Nueva función"
                    className="min-w-0 flex-1 rounded border p-2 dark:bg-slate-900"
                  />
                  <button
                    disabled={busy || newRole.trim().length < 2}
                    className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-40"
                  >
                    Agregar
                  </button>
                </form>
                <div className="mt-3 space-y-2">
                  {data.roles.map((role) => (
                    <RoleEditor
                      key={role.id}
                      role={role}
                      busy={busy}
                      onSave={(name, active) =>
                        void change("/api/roster/roles", {
                          action: "update",
                          id: role.id,
                          name,
                          active,
                        })
                      }
                    />
                  ))}
                </div>
              </details>
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">
                  Historial de cambios de la jornada (últimos 50)
                </summary>
                {data.history.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {data.history.map((event) => (
                      <li key={event.id}>
                        {new Date(event.createdAt).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        · {event.actor} {event.action === "ASSIGNED" ? "asignó" : "retiró a"}{" "}
                        {event.person} · {event.role}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Aún no hay cambios registrados.</p>
                )}
              </details>
            </>
          )}
        </>
      )}
    </main>
  );
}
