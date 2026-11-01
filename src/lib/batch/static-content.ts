import sanitizeHtml from "sanitize-html";
/** Keep formatted announcements, stripping executable HTML before persistence or public delivery. */
export function sanitizeStaticContent(actionType: string | null, payload: any) {
  if (actionType !== "message" || !payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    htmlContent: sanitizeHtml(typeof payload.htmlContent === "string" ? payload.htmlContent : ""),
    ctaUrl:
      typeof payload.ctaUrl === "string" && /^https?:\/\//i.test(payload.ctaUrl)
        ? payload.ctaUrl
        : undefined,
  };
}
