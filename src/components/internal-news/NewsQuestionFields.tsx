"use client";
import { useId } from "react";

import { NEWS_POLICY } from "@/lib/internal-news/contracts";

export interface NewsQuestionDraft {
  questionSetId: string;
  question: string;
  order: number;
  pointsForCorrect: number;
  pointsForIncorrect: number;
  active: boolean;
  answers: Array<{ answer: string; isCorrect: boolean; order: number }>;
}
export function NewsQuestionFields({
  value,
  onChange,
  sets,
}: {
  value: NewsQuestionDraft;
  onChange: (_draft: NewsQuestionDraft) => void;
  sets: Array<{ id: string; name: string; active: boolean }>;
}) {
  const id = useId();
  const inputClass = "mt-1 w-full min-w-0 rounded border border-slate-400 bg-transparent p-2";
  const update = <K extends keyof NewsQuestionDraft>(field: K, data: NewsQuestionDraft[K]) =>
    onChange({ ...value, [field]: data });
  return (
    <div className="space-y-4">
      <label className="block">
        Comunicado *
        <select
          className={inputClass}
          value={value.questionSetId}
          onChange={(e) => update("questionSetId", e.target.value)}
        >
          <option value="">Seleccionar comunicado…</option>
          {sets
            .filter((s) => s.active || s.id === value.questionSetId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {!s.active ? " (archivado)" : ""}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        Pregunta *
        <textarea
          className={inputClass}
          rows={3}
          value={value.question}
          onChange={(e) => update("question", e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { field: "order", label: "Orden", min: 1 },
            { field: "pointsForCorrect", label: "Puntos por respuesta correcta", min: 0 },
            { field: "pointsForIncorrect", label: "Puntos por respuesta incorrecta" },
          ] as const
        ).map((f) => (
          <label key={f.field} className="block min-w-0">
            {f.label}
            <input
              type="number"
              step={1}
              min={"min" in f ? f.min : undefined}
              className={inputClass}
              value={value[f.field]}
              onChange={(e) => update(f.field, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Pregunta activa
      </label>
      <fieldset className="space-y-2">
        <legend>Respuestas · selecciona la correcta</legend>
        {value.answers.map((answer, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-correct`}
              aria-label={`Respuesta correcta ${index + 1}`}
              checked={answer.isCorrect}
              onChange={() =>
                update(
                  "answers",
                  value.answers.map((a, i) => ({ ...a, isCorrect: i === index }))
                )
              }
            />
            <input
              className={inputClass}
              aria-label={`Respuesta ${index + 1}`}
              value={answer.answer}
              onChange={(e) =>
                update(
                  "answers",
                  value.answers.map((a, i) => (i === index ? { ...a, answer: e.target.value } : a))
                )
              }
            />
            <button
              type="button"
              aria-label={`Quitar respuesta ${index + 1}`}
              disabled={value.answers.length <= NEWS_POLICY.minAnswers}
              onClick={() =>
                update(
                  "answers",
                  value.answers
                    .filter((_, i) => i !== index)
                    .map((a, i) => ({ ...a, order: i + 1 }))
                )
              }
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          disabled={value.answers.length >= NEWS_POLICY.maxAnswers}
          onClick={() =>
            update("answers", [
              ...value.answers,
              { answer: "", isCorrect: false, order: value.answers.length + 1 },
            ])
          }
        >
          Añadir respuesta
        </button>
      </fieldset>
    </div>
  );
}
