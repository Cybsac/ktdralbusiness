export const WELCOME_ATTRACT_IMAGE_EFFECTS = ["none", "bounce", "heartbeat", "lights"] as const;
export type WelcomeAttractImageEffect = typeof WELCOME_ATTRACT_IMAGE_EFFECTS[number];
export type WelcomeAttractConfig = {
  enabled: boolean;
  mediaType: "image" | "video" | null;
  url: string | null;
  revision: string | null;
  imageEffect: WelcomeAttractImageEffect;
};

export const EMPTY_WELCOME_ATTRACT: WelcomeAttractConfig = { enabled: false, mediaType: null, url: null, revision: null, imageEffect: "none" };

const configuredIdleSeconds = Number(process.env.NEXT_PUBLIC_WELCOMEPLAYERS_IDLE_SECONDS);
export const WELCOME_ATTRACT_IDLE_MS = (Number.isFinite(configuredIdleSeconds) && configuredIdleSeconds > 0 ? configuredIdleSeconds : 30) * 1000;
export const WELCOME_ATTRACT_REFRESH_MS = 30_000;
export const WELCOME_ATTRACT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const WELCOME_ATTRACT_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
