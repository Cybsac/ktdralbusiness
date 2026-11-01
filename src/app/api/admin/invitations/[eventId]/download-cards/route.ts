import { getPublicBaseUrl } from "@/lib/config";
import { NextRequest } from "next/server";
import { createReadStream, createWriteStream } from "fs";
import { mkdtemp, unlink, rmdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import archiver from "archiver";
import { apiError } from "@/lib/apiError";
import { invitationOperator } from "@/lib/invitations/auth";
import { invitationFailure } from "@/lib/invitations/http";
import { assertEventAvailable } from "@/lib/invitations/calendar";
import { getEvent } from "@/lib/invitations/events";
import { generateInvitationCard, prepareInvitationCard } from "@/lib/invitations/generateCard";
import { checkRateLimit } from "@/lib/rateLimit";
export const runtime = "nodejs";
function disposition(name: string) {
  const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const operator = await invitationOperator(req, true);
    if (!operator) return apiError("UNAUTHORIZED", "Sin acceso", undefined, 401);
    const limit = checkRateLimit(`invitation:download:${operator.userId}`);
    if (!limit.ok) return apiError("RATE_LIMITED", "Intenta nuevamente", undefined, 429);
    const event = await getEvent(params.eventId);
    if (!event) throw new Error("EVENT_NOT_FOUND");
    assertEventAvailable(event);
    const guests = event.invitations.filter((g) => g.code && g.status !== "cancelled");
    if (!guests.length)
      return apiError("NO_CODES", "No hay invitaciones con código", undefined, 400);
    const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host"))
      ?.split(",")[0]
      .trim();
    const origin =
      host && (protocol === "https" || protocol === "http")
        ? new URL(`${protocol}://${host}`).origin
        : req.url;
    const base = getPublicBaseUrl(origin);
    const prepared = await prepareInvitationCard(event.templateUrl);
    const render = (guest: (typeof guests)[number]) =>
      generateInvitationCard({
        redeemUrl: `${base}/i/${encodeURIComponent(guest.code!)}`,
        guestName: guest.guestName,
        eventDate: event.date,
        templateUrl: event.templateUrl,
        prepared,
      });
    const guestId = req.nextUrl.searchParams.get("guestId");
    if (guestId) {
      const guest = guests.find((g) => g.id === guestId);
      if (!guest) throw new Error("INVITATION_NOT_FOUND");
      const buffer = await render(guest);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": disposition(`${guest.guestName}_${guest.code}.png`),
          "Cache-Control": "no-store",
        },
      });
    }
    const directory = await mkdtemp(path.join(tmpdir(), "invitation-export-")),
      file = path.join(directory, "cards.zip");
    cleanup = async () => {
      await unlink(file).catch(() => undefined);
      await rmdir(directory).catch(() => undefined);
    };
    const archive = archiver("zip", { zlib: { level: 6 } }),
      output = createWriteStream(file);
    const writing = pipeline(archive, output, { signal: req.signal });
    // Attach a rejection handler immediately while individual cards are rendered.
    void writing.catch(() => undefined);
    try {
      for (const guest of guests) {
        req.signal.throwIfAborted();
        const buffer = await render(guest);
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            archive.off("error", failed);
            resolve();
          };
          const failed = (error: Error) => {
            archive.off("entry", done);
            reject(error);
          };
          archive.once("entry", done);
          archive.once("error", failed);
          archive.append(buffer, {
            name: `${guest.guestName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "").replace(/\s+/g, "_")}_${guest.code}.png`,
          });
        });
      }
      await archive.finalize();
      await writing;
    } catch (error) {
      archive.destroy(error instanceof Error ? error : new Error("EXPORT_FAILED"));
      await writing.catch(() => undefined);
      throw error;
    }
    const input = createReadStream(file);
    const release = cleanup;
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      req.signal.removeEventListener("abort", abort);
      void release();
    };
    const abort = () => input.destroy();
    input.once("close", finish);
    req.signal.addEventListener("abort", abort, { once: true });
    if (req.signal.aborted) abort();
    cleanup = undefined;
    return new Response(Readable.toWeb(input) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": disposition(`event-${event.name}-cards.zip`),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await cleanup?.();
    return invitationFailure(error);
  }
}
