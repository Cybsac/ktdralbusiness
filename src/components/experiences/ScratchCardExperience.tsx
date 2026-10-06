"use client";

import ScratchSurface from "./ScratchSurface";
import { useScratchSounds } from "@/hooks/useScratchSounds";
import { SCRATCH_VISUAL_CONFIG } from "./scratch/scratchVisualConfig";

interface ScratchCardExperienceProps { prizeLabel?: string | null; disabled?: boolean; revealing?: boolean; revealed?: boolean; onReveal: () => void; }

export default function ScratchCardExperience({ prizeLabel, ...props }: ScratchCardExperienceProps) {
  const sounds = useScratchSounds();
  const label = prizeLabel?.trim() || "Premio sorpresa";
  return <ScratchSurface {...props} revealThreshold={SCRATCH_VISUAL_CONFIG.revealThreshold} onScratch={() => { void sounds.playScratch(); }} onReveal={() => { void sounds.playReveal(); props.onReveal(); }} renderContent={(progress) => {
    const revealRatio = Math.min(1, Math.max(0, progress / SCRATCH_VISUAL_CONFIG.revealThreshold));
    const blur = props.revealing || props.revealed ? 0 : Math.max(0, 14 * (1 - revealRatio));
    const opacity = props.revealing || props.revealed ? 1 : 0.38 + revealRatio * 0.62;
    return <div className="transition-[filter,opacity] duration-200" style={{ filter: `blur(${blur}px)`, opacity, willChange: "filter, opacity" }}>
      <div className="text-xs uppercase tracking-[.28em] text-white/65">Tu premio</div>
      <div className="mt-3 text-2xl font-black sm:text-3xl">{label}</div>
      {!props.revealing && !props.revealed && revealRatio < 1 && <div className="mt-2 text-sm text-white/70">Sigue raspando para descubrirlo</div>}
    </div>;
  }} />;
}
