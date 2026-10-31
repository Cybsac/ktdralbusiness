"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { gamePrizeAccessPath } from "@/lib/prize-games/links";

/** Presentation only. The destination retains the existing server delivery guards. */
export function PrizeRedemptionQr({ tokenId }: { tokenId: string }) {
  const path = gamePrizeAccessPath(tokenId);
  const [qr, setQr] = useState<{ path: string; image: string } | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const url = new URL(path, window.location.origin).toString();
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((image) => {
        if (active) setQr({ path, image });
      })
      .catch(() => {
        if (active) setFailedPath(path);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (!tokenId) return null;
  return (
    <figure className="mx-auto grid w-full min-w-0 max-w-xs justify-items-center gap-3 text-center">
      {qr?.path === path ? (
        <img
          src={qr.image}
          alt="QR de canje de tu premio"
          width={512}
          height={512}
          className="block aspect-square h-auto w-full max-w-[14rem] rounded-lg bg-white"
        />
      ) : (
        <p role="status" className="text-sm">
          {failedPath === path
            ? "No se pudo mostrar el QR. Usa el enlace del premio."
            : "Preparando QR de canje…"}
        </p>
      )}
      <figcaption className="w-full min-w-0 space-y-1 text-sm leading-relaxed">
        <p>Muestra este QR al personal para recibir tu premio.</p>
        <p className="text-xs opacity-75">
          Puedes guardar una captura. El canje está sujeto a la vigencia y disponibilidad del
          premio.
        </p>
        {failedPath === path && (
          <a className="inline-flex min-h-11 items-center underline" href={path}>
            Abrir premio
          </a>
        )}
      </figcaption>
    </figure>
  );
}
