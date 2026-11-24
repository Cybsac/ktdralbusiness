"use client";

import { useEffect, useRef } from 'react';
import { PrizeRedemptionQr } from './PrizeRedemptionQr';
import { useRouletteTheme } from '@/lib/themes/useRouletteTheme';
import styles from './resultModal.module.css';

export default function PrizeWinModal({ label, tokenId, onClose }: { label: string; tokenId?: string; onClose: () => void }) {
  const { config } = useRouletteTheme();
  const closeRef = useRef<HTMLButtonElement>(null);
  const modal = config.global.modal;
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="roulette-result-title" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="absolute inset-0 bg-black/75" aria-hidden="true" onClick={onClose} />
      <div className={`${styles.enter} relative z-10 rounded-xl p-6 sm:p-8 max-w-md w-full border border-white/10 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain overflow-x-hidden`} style={{ background: modal?.background || config.colors.background, boxShadow: modal?.boxShadow }}>
        <button ref={closeRef} type="button" onClick={onClose} className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 rounded-full p-2" aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <div className="text-center">
          <div className="text-5xl sm:text-7xl mb-4" aria-hidden="true">🎉</div>
          <h2 id="roulette-result-title" className="text-2xl sm:text-3xl font-bold mb-1">¡Bien hecho!</h2>
          <div className={`w-16 h-1 mx-auto rounded-full ${modal?.accentGradient ?? ''}`} style={!modal ? { background: config.colors.accent } : undefined} />
          <div className="my-6">
            <p className="text-sm sm:text-base text-white/70 mb-1">Has desbloqueado:</p>
            <p className={`text-2xl sm:text-4xl font-extrabold my-2 px-2 sm:px-4 break-words ${modal ? `text-transparent bg-clip-text ${modal.accentGradient}` : ''}`} style={!modal ? { color: config.colors.accent } : undefined}>{label}</p>
          </div>
          {tokenId && <div className="mb-5 text-white/90"><PrizeRedemptionQr tokenId={tokenId} /></div>}
          <button type="button" onClick={onClose} className={`px-6 sm:px-10 py-3 sm:py-4 rounded-full font-bold shadow-lg text-base sm:text-lg ${config.global.buttons?.primary ?? ''}`} style={!config.global.buttons?.primary ? { background: config.colors.primary } : undefined}>¡A rumbear!</button>
        </div>
      </div>
    </div>
  );
}
