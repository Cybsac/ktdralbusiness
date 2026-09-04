'use client';

type Rating = 'MALO' | 'REGULAR' | 'BUENO' | 'MUY_BUENO';

interface AttendanceEntry {
  person: { id: string; name: string; area: string | null };
  firstIn: string | null;
  lastOut: string | null;
  missingExit: boolean;
}

interface RatingOption {
  value: Rating;
  label: string;
  color: string;
  emoji: string;
}

interface CloseDayModalProps {
  open: boolean;
  attendance: AttendanceEntry[];
  ratingOptions: RatingOption[];
  generalRating: Rating;
  generalComment: string;
  personRatings: Map<string, { rating: Rating; note: string }>;
  saving: boolean;
  error: string;
  onClose: () => void;
  onGeneralRatingChange: (rating: Rating) => void;
  onGeneralCommentChange: (comment: string) => void;
  onPersonRatingChange: (personId: string, rating: Rating) => void;
  onPersonNoteChange: (personId: string, note: string) => void;
  onQuickComment: (text: string) => void;
  onSubmit: () => void;
}

const QUICK_COMMENTS = ['¡Todo bien!', '¡Buena noche!', 'Show fluido', 'Buen ambiente', 'Buena asistencia', 'Hubo incidencias'];

function formatTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function CloseDayModal({
  open,
  attendance,
  ratingOptions,
  generalRating,
  generalComment,
  personRatings,
  saving,
  error,
  onClose,
  onGeneralRatingChange,
  onGeneralCommentChange,
  onPersonRatingChange,
  onPersonNoteChange,
  onQuickComment,
  onSubmit,
}: CloseDayModalProps) {
  if (!open) return null;

  const commentIsValid = generalComment.trim().length > 0;
  const ratingsAreComplete = attendance.every((entry) => personRatings.has(entry.person.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Evaluar y cerrar jornada</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Completa la evaluación del show y del equipo antes de cerrar.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700" aria-label="Cerrar modal">
            &times;
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-800 dark:bg-blue-900/10">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Evaluación global del show</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {ratingOptions.map((option) => (
                <button key={option.value} type="button" onClick={() => onGeneralRatingChange(option.value)} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${generalRating === option.value ? option.color + ' ring-2 ring-blue-400' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {option.emoji} {option.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="daily-evaluation-comment">Comentario de la jornada <span className="text-red-600">*</span></label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_COMMENTS.map((text) => (
                <button key={text} type="button" onClick={() => onQuickComment(text)} className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-900/30">
                  {text}
                </button>
              ))}
            </div>
            <textarea id="daily-evaluation-comment" value={generalComment} onChange={(event) => onGeneralCommentChange(event.target.value)} rows={3} placeholder="Escribe cómo estuvo el show, el ambiente o cualquier incidencia..." className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
            {!commentIsValid && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">El comentario es obligatorio para cerrar la jornada.</p>}
          </section>

          {attendance.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Calificación individual</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{personRatings.size}/{attendance.length} completos</span>
              </div>
              <div className="space-y-2">
                {attendance.map((entry) => {
                  const current = personRatings.get(entry.person.id) || { rating: 'REGULAR' as Rating, note: '' };
                  return (
                    <div key={entry.person.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{entry.person.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{entry.person.area || '-'} · {formatTime(entry.firstIn)} - {formatTime(entry.lastOut)}</div>
                          {entry.missingExit && <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Sin salida registrada</div>}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {ratingOptions.map((option) => (
                            <button key={option.value} type="button" onClick={() => onPersonRatingChange(entry.person.id, option.value)} className={`flex h-8 w-8 items-center justify-center rounded border text-xs ${current.rating === option.value ? option.color + ' ring-1 ring-blue-400' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-400'}`} title={option.label}>{option.emoji}</button>
                          ))}
                        </div>
                      </div>
                      <input type="text" value={current.note} onChange={(event) => onPersonNoteChange(entry.person.id, event.target.value)} placeholder="Nota individual opcional..." className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end dark:border-slate-700">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
          <button type="button" onClick={onSubmit} disabled={saving || !commentIsValid || !ratingsAreComplete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Guardando y cerrando...' : 'Guardar evaluación y cerrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
