import { z } from "zod";

import { ALLOWED_AREAS } from "@/lib/areas";
export const NEWS_POLICY = {
  contentRoles: ["ADMIN", "COORDINATOR", "STAFF"],
  assignmentRoles: ["ADMIN", "COORDINATOR"],
  retries: 3,
  refreshIntervalMs: 30000,
  maxRecipients: 5000,
  minAnswers: 2,
  maxAnswers: 4,
  pageSize: 100,
  maxPageSize: 200,
} as const;
const text = z.string().trim().min(1).max(10000);
export const setCreateSchema = z.object({
  name: text.max(200),
  description: z.string().max(10000).optional(),
  regulationContent: z.string().max(100000).optional(),
  active: z.boolean().default(true),
});
export const setUpdateSchema = setCreateSchema.partial();
const answer = z.object({
  id: z.string().optional(),
  answer: text,
  isCorrect: z.boolean(),
  order: z.number().int().min(0),
});
const answers = z
  .array(answer)
  .min(NEWS_POLICY.minAnswers)
  .max(NEWS_POLICY.maxAnswers)
  .refine(
    (rows) => rows.filter((row) => row.isCorrect).length === 1,
    "Debe haber exactamente una respuesta correcta"
  );
export const questionCreateSchema = z.object({
  questionSetId: z.string().min(1),
  question: text,
  order: z.number().int().min(0),
  pointsForCorrect: z.number().int().min(0).default(10),
  pointsForIncorrect: z.number().int().default(0),
  active: z.boolean().default(true),
  answers,
});
export const questionUpdateSchema = questionCreateSchema.partial();
export const assignmentSchema = z.object({
  questionSetId: z.string().min(1),
  userIds: z.array(z.string().min(1)).max(NEWS_POLICY.maxRecipients).default([]),
  area: z.union([z.enum(ALLOWED_AREAS), z.literal("")]).optional(),
  assignToAll: z.boolean().default(false),
  includeTrivia: z.boolean().default(false),
  mandatory: z.boolean().default(true),
});
export const acceptanceSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  acceptOnly: z.boolean().default(false),
  answers: z.record(z.number().int().min(0)).optional(),
});
export const INTERNAL_NEWS_OPEN_EVENT = "internal-news:open";

export const assignmentListSchema = z.object({
  page: z.coerce.number().int().safe().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(NEWS_POLICY.maxPageSize).default(NEWS_POLICY.pageSize),
  status: z.enum(["PENDING", "COMPLETED", "SKIPPED"]).optional(),
  questionSetId: z.string().min(1).optional(),
});

export const INTERNAL_NEWS_COMPLETED_EVENT = "internal-news:completed";
export const inboxQuerySchema = z.object({
  page: z.coerce.number().int().safe().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(NEWS_POLICY.maxPageSize).default(20),
});
