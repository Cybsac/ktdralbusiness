import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin, INVITATION_TEMPLATES_BUCKET } from "@/lib/supabase-server";
import { invitationExpiration } from "./calendar";
import { INVITATION_POLICY as P } from "./policy";

export function templateStorageKey(value: string) {
  try {
    const url = new URL(value),
      base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const prefix = `/storage/v1/object/public/${INVITATION_TEMPLATES_BUCKET}/`;
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix) || url.search || url.hash)
      throw Error();
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!key || key.split("/").some((part) => !part || part === "." || part === ".."))
      throw Error();
    return key;
  } catch {
    throw new Error("TEMPLATE_INVALID");
  }
}
export async function assertTemplateAsset(tx: Prisma.TransactionClient, url: string) {
  const key = templateStorageKey(url);
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "InvitationTemplateAsset" WHERE "storageKey"=${key} FOR UPDATE`
  );
  const asset = await tx.invitationTemplateAsset.findUnique({ where: { storageKey: key } });
  if (!asset || asset.url !== url || asset.attempts > 0) throw new Error("TEMPLATE_UNAVAILABLE");
  return asset;
}
export async function deferTemplate(
  tx: Prisma.TransactionClient,
  url: string | null | undefined,
  until: Date
) {
  if (!url) return;
  await assertTemplateAsset(tx, url);
  await tx.invitationTemplateAsset.update({
    where: { url },
    data: { nextCheckAt: until, lastError: null },
  });
}
/** Reserve a unique object before upload; failures and abandoned forms remain collectable. */
export async function uploadInvitationTemplate(buffer: Buffer) {
  const storageKey = `templates/${randomUUID()}.png`;
  const url = supabaseAdmin.storage.from(INVITATION_TEMPLATES_BUCKET).getPublicUrl(storageKey).data
    .publicUrl as string;
  await prisma.invitationTemplateAsset.create({
    data: { storageKey, url, nextCheckAt: new Date(Date.now() + P.uploadLeaseMs) },
  });
  const { error } = await supabaseAdmin.storage
    .from(INVITATION_TEMPLATES_BUCKET)
    .upload(storageKey, buffer, { contentType: "image/png", upsert: false });
  if (error) {
    await prisma.invitationTemplateAsset.update({
      where: { storageKey },
      data: { nextCheckAt: new Date(), lastError: error.message },
    });
    throw new Error("TEMPLATE_FETCH_FAILED");
  }
  return url;
}
export async function cleanupInvitationTemplatesOnce(now = new Date()) {
  const assets = await prisma.invitationTemplateAsset.findMany({
    where: { nextCheckAt: { lte: now } },
    orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }],
    take: P.cleanupBatchSize,
  });
  let removed = 0,
    failed = 0;
  for (const asset of assets) {
    const lease = new Date(Date.now() + P.uploadLeaseMs);
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        const events = await tx.specialEvent.findMany({
          where: { templateUrl: asset.url },
          select: { id: true },
          orderBy: { id: "asc" },
        });
        if (events.length)
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "SpecialEvent" WHERE id IN (${Prisma.join(events.map((e) => e.id))}) ORDER BY id FOR UPDATE`
          );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "InvitationTemplateAsset" WHERE id=${asset.id} FOR UPDATE`
        );
        const current = await tx.invitationTemplateAsset.findUnique({ where: { id: asset.id } });
        if (!current || current.nextCheckAt > now) return false;
        const refs = await tx.specialEvent.findMany({ where: { templateUrl: asset.url } });
        const valid = refs.filter(
          (event) => event.status === "active" && invitationExpiration(event.date) > now
        );
        if (valid.length) {
          await tx.invitationTemplateAsset.update({
            where: { id: asset.id },
            data: {
              nextCheckAt: new Date(
                Math.max(...valid.map((e) => invitationExpiration(e.date).getTime()))
              ),
              lastError: null,
            },
          });
          return false;
        }
        // Adoption rejects attempts > 0. Commit this durable tombstone before deleting remotely.
        await tx.invitationTemplateAsset.update({
          where: { id: asset.id },
          data: { nextCheckAt: lease, attempts: { increment: 1 } },
        });
        await tx.specialEvent.updateMany({
          where: { templateUrl: asset.url },
          data: { templateUrl: null },
        });
        return true;
      });
      if (!claimed) continue;
      const { error } = await supabaseAdmin.storage
        .from(INVITATION_TEMPLATES_BUCKET)
        .remove([asset.storageKey]);
      if (error) throw new Error(error.message);
      await prisma.invitationTemplateAsset.deleteMany({
        where: { id: asset.id, nextCheckAt: lease },
      });
      removed++;
    } catch (error) {
      failed++;
      await prisma.invitationTemplateAsset.updateMany({
        where: { id: asset.id, nextCheckAt: lease },
        data: {
          nextCheckAt: new Date(Date.now() + P.retryMs),
          lastError: (error instanceof Error ? error.message : "DELETE_FAILED").slice(0, 1000),
        },
      });
    }
  }
  return { removed, failed };
}
