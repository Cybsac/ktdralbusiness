// Shared types for Dynamic Token Actions

export const ACTION_TYPES = [
  "prize",
  "trivia",
  "phrase",
  "challenge",
  "raffle",
  "message",
  "feedback",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface TriviaPayload {
  questions: Array<{
    question: string;
    answers: Array<{ text: string; correct: boolean }>;
    points: number;
  }>;
  successMessage: string;
  failMessage: string;
}

export interface PhrasePayload {
  phrases: string[];
  style: "motivational" | "funny" | "wisdom" | "custom";
  bgColor?: string;
}

export interface ChallengePayload {
  challenges: string[];
  difficulty: "easy" | "medium" | "hard";
  requiresValidation: boolean;
}

export interface RafflePayload {
  raffleName: string;
  autoNumber: boolean;
  maxParticipants?: number;
}

export interface MessagePayload {
  htmlContent: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface FeedbackPayload {
  prompt: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  thankYouMessage?: string;
}

export interface ActionComponentProps {
  payload: any;
  tokenId: string;
  prizeLabel: string;
  prizeColor: string | null;
  onComplete?: (_passed: boolean) => void;
  isStaff?: boolean;
  clientResponse?: string | null;
}

/** Action types that gate the QR behind a completion step */
export const GATED_ACTIONS: ReadonlySet<ActionType> = new Set(["trivia", "challenge", "feedback"]);

/** Action types that never award physical prizes (no stock consumption; exported QR still opens the experience) */
export const PRIZELESS_ACTIONS: ReadonlySet<ActionType> = new Set(["phrase", "message"]);

export const ACTION_LABELS: Record<ActionType, string> = {
  prize: "🎁 Premio",
  trivia: "🧩 Trivia Rápida",
  phrase: "💬 Frase / Consejo",
  challenge: "🎯 Reto / Desafío",
  raffle: "🎰 Sorteo",
  message: "📢 Mensaje / Anuncio",
  feedback: "✉️ Feedback del Cliente",
};

export const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  prize: "Token clásico: el cliente recibe un premio directo.",
  trivia: "Preguntas rápidas embebidas. Si acierta, gana.",
  phrase: "Muestra una frase motivacional, divertida o consejo del día.",
  challenge: "Un reto o desafío que el cliente debe completar.",
  raffle: "Genera un número/código de participación para sorteo en vivo.",
  message: "Muestra un mensaje HTML personalizado con formato.",
  feedback: "El cliente escribe un mensaje/texto y al enviarlo obtiene su premio.",
};

export const FEEDBACK_LIMITS = { minLength: 5, maxLength: 500, storageMaxLength: 2000 } as const;
export const DEFAULT_RAFFLE_PARTICIPANTS = 999;
