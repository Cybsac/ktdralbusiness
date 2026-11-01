import { INVITATION_POLICY as P } from "./policy";
import { templateStorageKey } from "./template-assets";
export async function fetchInvitationTemplate(url: string): Promise<Buffer> {
  templateStorageKey(url);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(P.fetchTimeoutMs),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("TEMPLATE_FETCH_FAILED");
  if (Number(response.headers.get("content-length")) > P.maxUploadBytes) {
    await response.body.cancel();
    throw new Error("TEMPLATE_TOO_LARGE");
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > P.maxUploadBytes) throw new Error("TEMPLATE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}
