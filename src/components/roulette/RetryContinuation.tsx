"use client";

export default function RetryContinuation({ onContinue }: { onContinue: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retry-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 text-center text-white shadow-xl">
        <h2 id="retry-title" className="text-xl font-bold">
          ¡Tienes otro intento!
        </h2>
        <p className="mt-3 text-sm text-white/70">
          Tu siguiente oportunidad está lista. Continúa para jugar.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
