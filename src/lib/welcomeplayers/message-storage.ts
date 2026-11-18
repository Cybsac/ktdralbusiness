import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-server";
import { WELCOME_ATTRACT_STORAGE_BUCKET } from "./attract-storage";
import { WELCOME_PLAYERS_DEFAULT_MESSAGE, WELCOME_PLAYERS_MESSAGE_MAX_LENGTH } from "./message";

const directory = "welcomeplayers/settings";
const key = `${directory}/message.json`;
const schema = z.object({ message: z.string().trim().min(1).max(WELCOME_PLAYERS_MESSAGE_MAX_LENGTH) }).strict();

export async function readWelcomeMessage() {
  const storage = supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET);
  const { data: entries, error: listError } = await storage.list(directory, { limit: 100, search: "message.json" });
  if (listError) throw listError;
  if (!entries?.some((entry: { name: string }) => entry.name === "message.json")) return WELCOME_PLAYERS_DEFAULT_MESSAGE;
  const { data, error } = await storage.download(key);
  if (error) throw error;
  return schema.parse(JSON.parse(await data.text())).message;
}

export async function writeWelcomeMessage(message: string) {
  const value = schema.parse({ message });
  const { error } = await supabaseAdmin.storage.from(WELCOME_ATTRACT_STORAGE_BUCKET).upload(key, Buffer.from(JSON.stringify(value)), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw error;
  return value.message;
}
