import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-server";
import { EMPTY_WELCOME_ATTRACT, WELCOME_ATTRACT_IMAGE_EFFECTS, type WelcomeAttractConfig } from "./attract";

const prefix = "welcomeplayers/attract";
export const WELCOME_ATTRACT_STORAGE_BUCKET = process.env.WELCOMEPLAYERS_MEDIA_BUCKET?.trim() || "exchange-media";
const manifestKey = `${prefix}/config.json`;
const assetKeys = { image: `${prefix}/background.webp`, mp4: `${prefix}/background.mp4`, webm: `${prefix}/background.webm` } as const;
const imageEffectSchema = z.preprocess((value) => value === "zoom" ? "bounce" : value === "glow" ? "lights" : value, z.enum(WELCOME_ATTRACT_IMAGE_EFFECTS).default("none"));
const manifestSchema = z.object({ enabled: z.boolean(), mediaType: z.enum(["image", "video"]), key: z.enum([assetKeys.image, assetKeys.mp4, assetKeys.webm]), revision: z.string().uuid(), imageEffect: imageEffectSchema }).refine((value) => value.mediaType === "image" ? value.key === assetKeys.image : value.key !== assetKeys.image);
export type AttractManifest = z.infer<typeof manifestSchema>;
export { assetKeys };

export async function readAttractManifest(): Promise<AttractManifest | null> {
  const listed = await supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).list(prefix, { limit: 100, search: "config.json" });
  if (listed.error) throw listed.error;
  if (!listed.data?.some((entry: { name: string }) => entry.name === "config.json")) return null;
  const { data, error } = await supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).download(manifestKey);
  if (error) {
    if (Number(error.statusCode || error.status) === 404 || error.error === "not_found") return null;
    throw error;
  }
  if (!data) return null;
  const parsed = manifestSchema.safeParse(JSON.parse(await data.text()));
  if (!parsed.success) throw new Error("INVALID_WELCOME_ATTRACT_CONFIG");
  return parsed.data;
}

export async function writeAttractManifest(value: AttractManifest) {
  const manifest = manifestSchema.parse(value);
  const { error } = await supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).upload(manifestKey, Buffer.from(JSON.stringify(manifest)), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw error;
}

export function attractPublicConfig(manifest: AttractManifest | null): WelcomeAttractConfig {
  if (!manifest) return EMPTY_WELCOME_ATTRACT;
  const { data } = supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).getPublicUrl(manifest.key);
  const url = new URL(data.publicUrl);
  url.searchParams.set("v", manifest.revision);
  return { enabled: manifest.enabled, mediaType: manifest.mediaType, url: url.toString(), revision: manifest.revision, imageEffect: manifest.imageEffect };
}
