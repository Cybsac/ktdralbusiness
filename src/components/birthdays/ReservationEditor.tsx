"use client";
import { type FormEvent, useState } from "react";

export function ReservationEditor({
  id,
  onSaved,
}: {
  id: string;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<any>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function open() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const [r, p] = await Promise.all([
        fetch(`/api/admin/birthdays/${id}`, { cache: "no-store" }),
        fetch("/api/birthdays/packs", { cache: "no-store" }),
      ]);
      const data = await r.json();
      const options = await p.json();
      if (!r.ok) throw new Error(data.message || "No se pudo cargar la reserva");
      if (!p.ok) throw new Error("No se pudieron cargar los paquetes");
      setPacks(
        options.packs.some((v: any) => v.id === data.packId)
          ? options.packs
          : [...options.packs, data.pack]
      );
      setForm({
        celebrantName: data.celebrantName,
        phone: data.phone,
        documento: data.documento,
        email: data.email || "",
        birthDate: data.birthDate?.slice(0, 10) || "",
        date: data.date.slice(0, 10),
        timeSlot: data.timeSlot,
        packId: data.packId,
        guestsPlanned: data.guestsPlanned,
        wantsPhotoSession: data.wantsPhotoSession,
        expectedUpdatedAt: data.updatedAt,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function regenerate() {
    const response = await fetch(`/api/admin/birthdays/${id}/cards/generate?regenerate=1`, {
      method: "POST",
    });
    if (!response.ok)
      throw new Error(
        "Los datos están guardados, pero no se pudo generar la tarjeta. Usa «Regenerar tarjeta» para reintentar."
      );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    let saved = false;
    try {
      const response = await fetch(`/api/admin/birthdays/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, birthDate: form.birthDate || undefined }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || data.error?.message || "No se pudieron guardar los datos");
      saved = true;
      setForm(null);
      await regenerate();
      setMessage("Reserva guardada y tarjeta actualizada. El QR conserva sus usos e historial.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (saved) await onSaved();
      setBusy(false);
    }
  }
  const field = (key: string, label: string, type = "text") => (
    <label className="block text-sm">
      {label}
      <input
        className="block w-full rounded border border-slate-400 bg-transparent p-2"
        required={key !== "email" && key !== "birthDate"}
        type={type}
        value={form[key]}
        onChange={(e) =>
          setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })
        }
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 5000 : undefined}
        pattern={key === "phone" ? "[0-9]{9}" : key === "documento" ? "[0-9]{8}" : undefined}
      />
    </label>
  );
  return (
    <section className="rounded-xl border border-slate-300 p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy} onClick={open}>
          Editar reserva
        </button>
        <button
          className="btn-outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await regenerate();
              setMessage("Tarjeta regenerada con los datos actuales y el mismo QR.");
              await onSaved();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Regenerar tarjeta
        </button>
        {busy && <span role="status">Procesando…</span>}
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-600">
          {message}
        </p>
      )}
      {form && (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("celebrantName", "Nombre y apellido")}
            {field("documento", "DNI (8 dígitos)")}
            {field("phone", "WhatsApp (9 dígitos)")}
            {field("birthDate", "Fecha de nacimiento", "date")}
            {field("date", "Fecha", "date")}
            {field("timeSlot", "Hora", "time")}
            {field("guestsPlanned", "Invitados previstos", "number")}
            <label className="text-sm">
              Paquete
              <select
                className="block w-full rounded border border-slate-400 bg-transparent p-2"
                value={form.packId}
                onChange={(e) => setForm({ ...form, packId: e.target.value })}
              >
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.qrCount} ingresos)
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <input
              type="checkbox"
              checked={form.wantsPhotoSession}
              onChange={(e) => setForm({ ...form, wantsPhotoSession: e.target.checked })}
            />{" "}
            Sesión de fotos
          </label>
          <p className="text-sm">
            Al guardar se regenerará la tarjeta conservando el QR. La fecha y el paquete solo se
            pueden cambiar antes de registrar ingresos.
          </p>
          <div className="flex gap-2">
            <button className="btn" type="submit" disabled={busy}>
              Guardar y regenerar tarjeta
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Cancelar edición
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
