import type { TokenExperienceType } from "./types";

export interface ExperienceUiConfig {
  title: string;
  subtitle: string;
  steps: readonly [string, string, string];
  flowLabel: string;
  instruction: string;
  spinErrorFallback: string;
  disabledMessage: string;
  dailyMetricLabel: string;
}

const EXPERIENCE_UI: Record<TokenExperienceType, ExperienceUiConfig> = {
  roulette: {
    title: "Ruleta Token Show",
    subtitle: "Escanea tu QR, gira la rueda y descubre al instante lo que te toca esta noche.",
    steps: ["Escanea", "Gira", "Reclama"],
    flowLabel: "Flujo de la ruleta",
    instruction: "Presiona GIRAR para comenzar y espera el resultado en pantalla.",
    spinErrorFallback: "Error al girar la ruleta",
    disabledMessage: "Aún no soltamos la ruleta. Se enciende a las 6:00 PM. Quédate cerca.",
    dailyMetricLabel: "Giros del día",
  },
  scratch_card: {
    title: "Raspa y gana",
    subtitle: "Escanea tu QR, raspa la tarjeta y descubre al instante lo que te toca esta noche.",
    steps: ["Escanea", "Raspa", "Reclama"],
    flowLabel: "Flujo de raspa y gana",
    instruction: "Raspa la tarjeta para descubrir tu premio.",
    spinErrorFallback: "No se pudo descubrir tu premio",
    disabledMessage: "Aún no habilitamos esta experiencia. Quédate cerca.",
    dailyMetricLabel: "Jugadas del día",
  },
};

export function getExperienceUi(type?: string | null): ExperienceUiConfig {
  return EXPERIENCE_UI[type === "scratch_card" ? "scratch_card" : "roulette"];
}
