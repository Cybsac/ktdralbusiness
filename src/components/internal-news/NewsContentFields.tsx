"use client";
import { NewsEditor } from "./NewsEditor";

export interface NewsDraft {
  name: string;
  description: string;
  regulationContent: string;
  active: boolean;
}
export function NewsContentFields({
  value,
  onChange,
}: {
  value: NewsDraft;
  onChange: (_value: NewsDraft) => void;
}) {
  const fieldClass = "mt-1 w-full rounded border border-slate-400 bg-transparent p-2";
  return (
    <div className="space-y-4">
      <label className="block">
        Nombre *
        <input
          className={fieldClass}
          maxLength={200}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <label className="block">
        Descripción
        <textarea
          className={fieldClass}
          rows={2}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      <div>
        <p className="mb-1">Contenido del comunicado</p>
        <NewsEditor
          value={value.regulationContent}
          onChange={(html) => onChange({ ...value, regulationContent: html })}
        />
      </div>
      <p className="text-xs text-slate-500">
        Las ediciones se aplican a futuras asignaciones. Cada persona conserva la revisión que
        recibió.
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => onChange({ ...value, active: e.target.checked })}
        />
        Comunicado activo
      </label>
    </div>
  );
}
