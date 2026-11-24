import { Suspense } from 'react';
import RouletteClientPage from './RouletteClientPage';
import styles from './rouletteLayout.module.css';
import RouletteBackground from '@/components/roulette/RouletteBackground';
import { RouletteThemeProvider } from '@/components/theme/RouletteThemeProvider';
import { ThemeWrapper } from '@/components/theme/ThemeWrapper';
import { getAvailableThemeNames } from '@/lib/themes/registry';
import type { ThemeName } from '@/lib/themes/types';
import { loadPublicGame } from '@/lib/prize-games/public-load';
import SmartPreloader from '@/components/common/SmartPreloader';

async function GameContent({ tokenId, theme }: { tokenId: string; theme: ThemeName }) {
  const initial = await loadPublicGame(tokenId);
  return <RouletteClientPage key={tokenId} tokenId={tokenId} initial={initial} theme={theme} />;
}

export default function PublicRoulettePage({ tokenId, theme: requestedTheme }: { tokenId: string; theme?: string }) {
  const theme: ThemeName = getAvailableThemeNames().find(value => value === requestedTheme) ?? 'default';
  return (
    <RouletteThemeProvider initialTheme={theme}>
      <ThemeWrapper theme={theme}>
        <div className="relative min-h-[calc(100dvh-1px)] flex flex-col px-0 pt-0 pb-0 -mt-2 roulette-theme-container overflow-x-hidden">
          <RouletteBackground />
          <div className={`relative z-[1] flex-1 w-full max-w-5xl mx-auto flex flex-col ${styles.rouletteViewport}`}>
            <Suspense key={tokenId} fallback={<div className="flex-1 flex items-center justify-center"><SmartPreloader /></div>}>
              <GameContent tokenId={tokenId} theme={theme} />
            </Suspense>
          </div>
          <footer className="relative z-[1] -mt-px pb-0 pt-0 text-center text-white/50 text-xs leading-none roulette-footer">
            <p>© {new Date().getFullYear()} Go Lounge!</p>
          </footer>
        </div>
      </ThemeWrapper>
    </RouletteThemeProvider>
  );
}
