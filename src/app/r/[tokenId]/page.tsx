import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { buildTitle } from '@/lib/seo/title';
import PublicRoulettePage from '@/app/marketing/ruleta/PublicRoulettePage';
import MarketingLayout from '@/app/marketing/layout';

export async function generateMetadata({ params }: { params: { tokenId: string } }) {
  return { title: buildTitle(['Token', params.tokenId.slice(0,10)]) };
}

// Aseguramos ejecución siempre en runtime Node y sin caché para evitar falsos negativos en lookups
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// Sanitize possible copy/paste artifacts from CSV (e.g. 'https://domain/r/<id>' or 'm/r/<id>' or trailing commas)
function sanitizeTokenId(raw: string): string {
  // take last path segment if a URL fragment was pasted
  let t = raw.trim();
  if (t.includes("/")) t = t.split("/").pop() || t; // last segment
  // cut off any CSV residual commas
  if (t.includes(",")) t = t.split(",")[0];
  return t.trim();
}

/** Keep existing QR paths and birthday routing; game pages render directly. */
export default async function TokenPage({ params, searchParams }: { params: { tokenId: string }; searchParams?: { theme?: string } }) {
  const cleanId = sanitizeTokenId(params.tokenId);
  // Si es invitación de cumpleaños -> /b/<code>
  const invite = await prisma.inviteToken.findUnique({ where: { code: cleanId }, select: { id: true } }).catch(() => null);
  if (invite) redirect(`/b/${encodeURIComponent(cleanId)}`);
  return <MarketingLayout><PublicRoulettePage tokenId={cleanId} theme={searchParams?.theme} /></MarketingLayout>;
}
 
