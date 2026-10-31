import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { logEvent } from "@/lib/log";

import { NewsError, newsOperator } from "./core";
export function newsFailure(error: unknown) {
  const validation = error instanceof ZodError;
  const invalidJson = error instanceof SyntaxError;
  const code =
    error instanceof NewsError
      ? error.code
      : validation
        ? "INVALID_INPUT"
        : invalidJson
          ? "BAD_REQUEST"
          : "INTERNAL_ERROR";
  const message =
    error instanceof NewsError
      ? error.message
      : validation
        ? error.issues[0]?.message || "Datos inválidos"
        : invalidJson
          ? "JSON inválido"
          : "No se pudo completar la operación";
  const status = error instanceof NewsError ? error.status : validation || invalidJson ? 400 : 500;
  if (status === 500) console.error("[INTERNAL_NEWS]", error);
  return NextResponse.json(
    { ok: false, success: false, code, message, error: { code, message } },
    { status }
  );
}
export async function newsAdmin(
  req: Request,
  kind: "content" | "assignment",
  fn: () => Promise<unknown>,
  legacy = false
) {
  try {
    const actor = await newsOperator(req, kind);
    const result = await fn();
    if (req.method !== "GET")
      await logEvent("INTERNAL_NEWS_CHANGE", "Cambio en comunicados internos", {
        actor: actor.userId,
        role: actor.role,
        method: req.method,
        path: new URL(req.url).pathname,
      });
    return NextResponse.json(
      legacy
        ? { ok: true, ...(Array.isArray(result) ? { data: result } : (result as object)) }
        : { ok: true, success: true, data: result }
    );
  } catch (error) {
    return newsFailure(error);
  }
}
