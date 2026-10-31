import { Prisma } from "@prisma/client";
import { z } from "zod";

import { NewsError } from "./core";
import { sanitizeNewsHtml } from "./html";

const answer = z.object({
  id: z.string(),
  answer: z.string(),
  isCorrect: z.boolean(),
  order: z.number(),
});
export const snapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  regulationContent: z.string().nullable().optional(),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      order: z.number(),
      pointsForCorrect: z.number().optional(),
      pointsForIncorrect: z.number().optional(),
      answers: z.array(answer),
    })
  ),
});
export type NewsSnapshot = z.infer<typeof snapshotSchema>;

export function captureNews(input: unknown): NewsSnapshot {
  const value = snapshotSchema.parse(input);
  return {
    ...value,
    regulationContent: sanitizeNewsHtml(value.regulationContent || value.description),
    questions: [...value.questions]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((q) => ({
        ...q,
        answers: [...q.answers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
      })),
  };
}

export async function ensureNewsRevision(
  tx: Prisma.TransactionClient,
  set: { id: string; contentVersion: number }
) {
  const existing = await tx.internalNewsRevision.findUnique({
    where: { questionSetId_version: { questionSetId: set.id, version: set.contentVersion } },
  });
  if (existing) return existing;
  return tx.internalNewsRevision.create({
    data: { questionSetId: set.id, version: set.contentVersion, snapshot: captureNews(set) },
  });
}

export function assignedContent(item: { revision?: { snapshot: unknown } | null }) {
  if (!item.revision)
    throw new NewsError("REVISION_MISSING", "La revisión del comunicado no está disponible", 409);
  return captureNews(item.revision.snapshot);
}

export function publicNewsContent(snapshot: NewsSnapshot) {
  return {
    ...snapshot,
    questions: snapshot.questions.map((q) => ({
      ...q,
      answers: q.answers.map(({ isCorrect: _correct, ...a }) => a),
    })),
  };
}
