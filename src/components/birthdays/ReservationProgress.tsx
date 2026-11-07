"use client";

const steps = ["Tus datos", "Celebración", "Pack", "Confirmar"];

export function ReservationProgress({ current }: { current: number }) {
  return (
    <ol aria-label="Progreso de reserva" className="grid grid-cols-4 gap-1 sm:gap-3">
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`border-t-2 pt-2 text-center text-xs sm:text-sm ${index <= current ? "border-orange-400 text-orange-200" : "border-white/20 text-white/50"}`}
        >
          <span className="block font-semibold">{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
