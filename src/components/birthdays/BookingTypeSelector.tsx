"use client";

export function BookingTypeSelector({ surprise, onChange }: { surprise: boolean; onChange: (surprise: boolean) => void }) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Tipo de reserva</legend>
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {[{ value: false, title: "Reserva habitual", detail: "Con el DNI del cumpleañero" }, { value: true, title: "Celebración sorpresa", detail: "Con el DNI del organizador" }].map((option) => (
          <label key={String(option.value)} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${surprise === option.value ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"}`}>
            <input type="radio" name="birthday-booking-type" checked={surprise === option.value} onChange={() => onChange(option.value)} className="h-4 w-4 shrink-0 accent-blue-600" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{option.title}</span><span className="block text-xs opacity-80">{option.detail}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function VerifiedOrganizer({ name }: { name: string }) {
  return <div role="status" className="col-span-full min-w-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"><span className="block text-xs font-medium">Organizador identificado</span><span className="block break-words font-semibold">{name}</span></div>;
}
