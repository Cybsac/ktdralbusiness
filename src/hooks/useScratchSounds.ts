import { useCallback, useEffect, useRef } from "react";

export function useScratchSounds() {
  const contextRef = useRef<AudioContext | null>(null);
  const lastScratchRef = useRef(0);

  const ensureContext = useCallback(async () => {
    if (!contextRef.current) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      contextRef.current = new AudioCtor();
    }
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    return contextRef.current;
  }, []);

  const playScratch = useCallback(async () => {
    const now = performance.now();
    if (now - lastScratchRef.current < 34) return;
    lastScratchRef.current = now;
    const ctx = await ensureContext();
    if (!ctx) return;
    const duration = 0.045;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
    filter.type = "bandpass"; filter.frequency.value = 1500; filter.Q.value = 0.7; gain.gain.value = 0.045;
    source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start();
  }, [ensureContext]);

  const playReveal = useCallback(async () => {
    const ctx = await ensureContext(); if (!ctx) return;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.type = "sine"; oscillator.frequency.setValueAtTime(520, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + 0.16); gain.gain.setValueAtTime(0.001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.3);
  }, [ensureContext]);

  useEffect(() => () => { void contextRef.current?.close(); contextRef.current = null; }, []);
  return { playScratch, playReveal };
}
