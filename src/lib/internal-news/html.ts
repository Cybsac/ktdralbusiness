import sanitizeHtml, { simpleTransform } from "sanitize-html";
export function sanitizeNewsHtml(html: string | null | undefined) {
  return sanitizeHtml(html || "", {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "span",
      "div",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
