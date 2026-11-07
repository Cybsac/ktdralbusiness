"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
let scriptPromise: Promise<void> | undefined;
function loadWidget() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = undefined;
        script.remove();
        reject();
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export function PublicChallenge({
  onToken,
  resetKey,
  manualFallback = true,
}: {
  onToken: (token: string) => void;
  resetKey: number;
  manualFallback?: boolean;
}) {
  const target = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState(false);
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let id: string | undefined;
    callback.current("");
    loadWidget()
      .then(() => {
        if (!cancelled && target.current && window.turnstile)
          id = window.turnstile.render(target.current, {
            sitekey: key,
            action: "dni_lookup",
            callback: (value: string) => callback.current(value),
            "expired-callback": () => callback.current(""),
            "error-callback": () => {
              callback.current("");
              setError(true);
            },
          });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [key, resetKey]);
  if (!key)
    return (
      <p className="text-sm">
        La consulta automática no está disponible.{" "}
        {manualFallback
          ? "Puedes completar los datos manualmente."
          : "Inténtalo más tarde o contacta al equipo."}
      </p>
    );
  return (
    <div>
      <div ref={target} />
      {error && (
        <p className="text-sm">
          No se pudo cargar la verificación.{" "}
          {manualFallback
            ? "Puedes completar los datos manualmente."
            : "Inténtalo más tarde o contacta al equipo."}
        </p>
      )}
    </div>
  );
}
