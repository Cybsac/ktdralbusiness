"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useScratchEngine } from "./scratch/useScratchEngine";

interface ScratchSurfaceProps { children?: ReactNode; renderContent?: (progress: number) => ReactNode; onReveal: () => void; onScratch?: () => void; disabled?: boolean; revealing?: boolean; revealed?: boolean; revealThreshold?: number; }

export default function ScratchSurface({ children, renderContent, onReveal, onScratch, disabled = false, revealing = false, revealed = false, revealThreshold = 0.48 }: ScratchSurfaceProps) {
  const engine = useScratchEngine(onReveal, disabled || revealing || revealed, { revealThreshold }, onScratch);
  const covered = !revealing && !revealed && !engine.state.completed;
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  useEffect(() => {
    if (!engine.state.completed) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    setParticles(Array.from({ length: 10 }, (_, index) => ({ id: index, x: 22 + ((index * 37) % 56), y: 30 + ((index * 23) % 40), delay: index * 18 })));
    const timer = window.setTimeout(() => setParticles([]), 700);
    return () => window.clearTimeout(timer);
  }, [engine.state.completed]);

  return <div className="relative mx-auto w-full max-w-md select-none px-4">
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-amber-100/25 bg-black/30 shadow-[0_18px_45px_rgba(0,0,0,.35)] touch-none">
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">{renderContent ? renderContent(engine.state.progress) : children}</div>
      <canvas ref={engine.canvasRef} className={`absolute inset-0 h-full w-full transition-opacity duration-[350ms] ${covered ? "opacity-100" : "pointer-events-none opacity-0"}`} onPointerDown={engine.pointerDown} onPointerMove={engine.pointerMove} onPointerUp={engine.stop} onPointerCancel={engine.stop} onLostPointerCapture={engine.stop} aria-label="Área para raspar y descubrir el premio" />
      {particles.map((particle) => <span key={particle.id} aria-hidden="true" className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-amber-100/80" style={{ left: `${particle.x}%`, top: `${particle.y}%`, animation: `scratch-particle 650ms ease-out ${particle.delay}ms both` }} />)}
    </div>
    <div className="mt-4 text-center text-xs text-white/55" aria-live="polite">{revealing ? "Descubriendo tu premio…" : revealed ? "Premio descubierto" : engine.state.progress > 0 ? "Sigue raspando…" : "Raspa la tarjeta con tu dedo"}</div>
  </div>;
}
