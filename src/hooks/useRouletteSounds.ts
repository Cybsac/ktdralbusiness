import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ROULETTE_CONFIG } from '@/lib/experiences/roulette-config';

type Tone = { from: number; to: number; duration: number; gain: number; offset?: number; type?: OscillatorType };

export function useRouletteSounds(enabled = true) {
  const contextRef = useRef<AudioContext | null>(null);
  const active = useRef(new Set<OscillatorNode>());

  const activate = useCallback(async () => {
    if (!enabled || document.hidden) return;
    try {
      if (!contextRef.current || contextRef.current.state === 'closed') {
        const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        contextRef.current = new Audio();
      }
      if (contextRef.current.state === 'suspended') await contextRef.current.resume();
    } catch { /* A blocked audio context must never block a game. */ }
  }, [enabled]);

  const stopActive = useCallback(() => {
    for (const node of active.current) {
      try { node.stop(); } catch { /* Already ended. */ }
    }
    active.current.clear();
  }, []);

  const cleanup = useCallback(() => {
    stopActive();
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, [stopActive]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => { void activate(); };
    const visibility = () => { if (document.hidden) stopActive(); };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      cleanup();
    };
  }, [enabled, activate, cleanup, stopActive]);

  const play = useCallback((tones: readonly Tone[]) => {
    const context = contextRef.current;
    if (!enabled || !context || context.state !== 'running' || document.hidden) return;
    for (const tone of tones) {
      try {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + (tone.offset ?? 0);
        const end = start + tone.duration;
        osc.type = tone.type ?? 'sine';
        osc.frequency.setValueAtTime(tone.from, start);
        osc.frequency.exponentialRampToValueAtTime(tone.to, end);
        gain.gain.setValueAtTime(tone.gain, start);
        gain.gain.exponentialRampToValueAtTime(ROULETTE_CONFIG.audio.fadeFloor, end);
        osc.connect(gain);
        gain.connect(context.destination);
        active.current.add(osc);
        osc.onended = () => { active.current.delete(osc); osc.disconnect(); gain.disconnect(); };
        osc.start(start);
        osc.stop(end);
      } catch { /* Audio is an optional presentation layer. */ }
    }
  }, [enabled]);

  const playSpinStart = useCallback(() => play(ROULETTE_CONFIG.audio.start), [play]);
  const playSectorTick = useCallback(() => play(ROULETTE_CONFIG.audio.tick), [play]);
  const playSpinStop = useCallback(() => play(ROULETTE_CONFIG.audio.stop), [play]);
  const playWin = useCallback(() => play(ROULETTE_CONFIG.audio.win), [play]);
  const playLose = useCallback(() => play(ROULETTE_CONFIG.audio.lose), [play]);

  return useMemo(() => ({ playSpinStart, playSectorTick, playSpinStop, playWin, playLose, cleanup }), [playSpinStart, playSectorTick, playSpinStop, playWin, playLose, cleanup]);
}
