import { prisma } from "@/lib/prisma";

import {
  questionCreateSchema,
  questionUpdateSchema,
  setCreateSchema,
  setUpdateSchema,
} from "./contracts";
import { assertEditable, NewsError, serialNews } from "./core";
import { sanitizeNewsHtml } from "./html";
export async function createNewsSet(input: unknown) {
  const data = setCreateSchema.parse(input);
  return serialNews(async (tx) => {
    if (
      await tx.triviaQuestionSet.findFirst({
        where: { name: { equals: data.name, mode: "insensitive" } },
      })
    )
      throw new NewsError("CONFLICT", "Ya existe un comunicado con este nombre", 409);
    return tx.triviaQuestionSet.create({
      data: {
        ...data,
        audience: "INTERNAL",
        regulationContent: sanitizeNewsHtml(data.regulationContent),
      },
    });
  });
}
export async function updateNewsSet(id: string, input: unknown) {
  const parsed = setUpdateSchema.parse(input);
  const data = {
    ...parsed,
    ...(parsed.description !== undefined ? { description: parsed.description.trim() || null } : {}),
  };
  return serialNews(async (tx) => {
    const existing = await tx.triviaQuestionSet.findUnique({ where: { id } });
    if (!existing || existing.audience !== "INTERNAL")
      throw new NewsError("NOT_FOUND", "Comunicado no encontrado", 404);
    const contentChanged =
      (data.name !== undefined && data.name !== existing.name) ||
      (data.description !== undefined && data.description !== existing.description) ||
      (data.regulationContent !== undefined &&
        sanitizeNewsHtml(data.regulationContent) !== sanitizeNewsHtml(existing.regulationContent));
    if (contentChanged) await assertEditable(tx, id);
    if (
      data.name &&
      (await tx.triviaQuestionSet.findFirst({
        where: { name: { equals: data.name, mode: "insensitive" }, id: { not: id } },
      }))
    )
      throw new NewsError("CONFLICT", "Ya existe un comunicado con este nombre", 409);
    return tx.triviaQuestionSet.update({
      where: { id },
      data: {
        ...data,
        ...(contentChanged ? { contentVersion: { increment: 1 } } : {}),
        ...(data.regulationContent !== undefined
          ? { regulationContent: sanitizeNewsHtml(data.regulationContent) }
          : {}),
      },
    });
  });
}
export async function archiveNewsSet(id: string) {
  if (
    !(await prisma.triviaQuestionSet.findUnique({
      where: { id, audience: "INTERNAL" },
      select: { id: true },
    }))
  )
    throw new NewsError("NOT_FOUND", "Comunicado no encontrado", 404);
  return prisma.triviaQuestionSet.update({ where: { id }, data: { active: false } });
}
export async function saveNewsQuestion(id: string | null, input: unknown) {
  const data = id ? questionUpdateSchema.parse(input) : questionCreateSchema.parse(input);
  return serialNews(async (tx) => {
    const existing = id ? await tx.triviaQuestion.findUnique({ where: { id } }) : null;
    if (id && !existing) throw new NewsError("NOT_FOUND", "Pregunta no encontrada", 404);
    const setId = data.questionSetId ?? existing?.questionSetId;
    if (!setId) throw new NewsError("SET_REQUIRED", "Selecciona un comunicado");
    if (existing?.questionSetId) {
      if (
        !(await tx.triviaQuestionSet.findUnique({
          where: { id: existing.questionSetId, audience: "INTERNAL" },
        }))
      )
        throw new NewsError("NOT_FOUND", "Pregunta interna no encontrada", 404);
      await assertEditable(tx, existing.questionSetId);
    }
    await assertEditable(tx, setId);
    if (
      !(await tx.triviaQuestionSet.findUnique({
        where: { id: setId, active: true, audience: "INTERNAL" },
      }))
    )
      throw new NewsError("SET_NOT_FOUND", "Comunicado no disponible", 404);
    const order = data.order ?? existing?.order;
    if (
      await tx.triviaQuestion.findFirst({
        where: { questionSetId: setId, order, ...(id ? { id: { not: id } } : {}) },
      })
    )
      throw new NewsError("ORDER_CONFLICT", "Ya existe una pregunta con ese orden", 409);
    await tx.triviaQuestionSet.update({
      where: { id: setId },
      data: { contentVersion: { increment: 1 } },
    });
    if (existing?.questionSetId && existing.questionSetId !== setId)
      await tx.triviaQuestionSet.update({
        where: { id: existing.questionSetId },
        data: { contentVersion: { increment: 1 } },
      });
    const { answers, ...fields } = data;
    const answerRows = answers?.map(({ id: _id, ...answer }) => answer);
    if (id)
      return tx.triviaQuestion.update({
        where: { id },
        data: {
          ...fields,
          questionSetId: setId,
          ...(answerRows ? { answers: { deleteMany: {}, create: answerRows } } : {}),
        },
        include: { answers: { orderBy: { order: "asc" } } },
      });
    return tx.triviaQuestion.create({
      data: {
        ...fields,
        questionSetId: setId,
        question: data.question!,
        order: data.order!,
        pointsForCorrect: data.pointsForCorrect,
        pointsForIncorrect: data.pointsForIncorrect,
        answers: { create: answerRows },
      },
      include: { answers: { orderBy: { order: "asc" } } },
    });
  });
}
export async function archiveNewsQuestion(id: string) {
  return serialNews(async (tx) => {
    const question = await tx.triviaQuestion.findUnique({ where: { id } });
    if (!question) throw new NewsError("NOT_FOUND", "Pregunta no encontrada", 404);
    if (question.questionSetId) await assertEditable(tx, question.questionSetId);
    if (await tx.triviaProgress.count({ where: { questionId: id } }))
      throw new NewsError("CONTENT_IN_USE", "La pregunta ya tiene respuestas registradas", 409);
    if (
      !question.questionSetId ||
      !(await tx.triviaQuestionSet.findUnique({
        where: { id: question.questionSetId, audience: "INTERNAL" },
      }))
    )
      throw new NewsError("NOT_FOUND", "Pregunta interna no encontrada", 404);
    await tx.triviaQuestionSet.update({
      where: { id: question.questionSetId },
      data: { contentVersion: { increment: 1 } },
    });
    return tx.triviaQuestion.update({ where: { id }, data: { active: false } });
  });
}
