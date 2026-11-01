// One visual definition for the universal invitation. Historical host codes retain rendering support.
const storageOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
export const birthdayInviteTemplate = {
  path:
    process.env.BIRTHDAY_TEMPLATE_URL ||
    `${storageOrigin}/storage/v1/object/public/birthday-templates/newversioncard.webp`,
  width: 1080,
  height: 1920,
  area: { leftRatio: 0.2116, topRatio: 0.126, sizeRatio: 0.5768 },
  nameBar: {
    leftRatio: 144.2 / 1080,
    widthRatio: 791.6 / 1080,
    topRatio: 1364 / 1920,
    heightRatio: 90 / 1920,
  },
} as const;
export type InviteTemplateKind = "guest" | "host";
