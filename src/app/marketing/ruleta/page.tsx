import React, { Suspense } from "react";
import styles from "./rouletteLayout.module.css";
import { Metadata } from "next";
import RouletteClientPage from "./RouletteClientPage";
import RouletteBackground from "@/components/roulette/RouletteBackground";
import { RouletteThemeProvider } from "@/components/theme/RouletteThemeProvider";
import { ThemeWrapper } from "@/components/theme/ThemeWrapper";
import { ThemeName } from "@/lib/themes/types";

export const metadata: Metadata = {
  title: "Ruleta de Premios",
  description: "Gira la ruleta y descubre tu premio en Go Lounge!",
};

interface RuletaSearchParams {
  tokenId?: string;
  theme?: string;
}

export default function RuletaPage({ searchParams }: { searchParams: RuletaSearchParams }) {
  const theme = (searchParams.theme as ThemeName) || "default";

  return (
    <RouletteThemeProvider initialTheme={theme}>
      <ThemeWrapper theme={theme}>
        <div className="relative min-h-[calc(100dvh-1px)] flex flex-col px-0 pt-0 pb-0 -mt-2 roulette-theme-container overflow-x-hidden">
          {/* Fondo compuesto reutilizable intacto: degradado base + efectos */}
          <RouletteBackground />
          <div
            className={`relative z-[1] flex-1 w-full max-w-5xl mx-auto flex flex-col ${styles.rouletteViewport}`}
          >
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50">Cargando experiencia...</div>}>
              <RouletteClientPage theme={theme} />
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
