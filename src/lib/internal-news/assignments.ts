import { createHash } from "crypto";

import { prisma } from "@/lib/prisma";
import { CURRENT_REGULATION } from "@/lib/regulations/constants";

import { acceptanceSchema, assignmentListSchema, assignmentSchema, NEWS_POLICY } from "./contracts";
import { NewsError, serialNews } from "./core";
import { assignedContent, ensureNewsRevision } from "./revisions";
export const assignmentSelect = {
  id: true,
  userId: true,
  questionSetId: true,
  revision: { select: { version: true } },
  status: true,
  includeTrivia: true,
  mandatory: true,
  assignedAt: true,
  completedAt: true,
  user: {
    select: { id: true, username: true, person: { select: { name: true, area: true } } },
  },
  questionSet: { select: { id: true, name: true, active: true } },
} as const;
export async function assignNews(input: unknown) {
  const data = assignmentSchema.parse(input);
  if (!data.assignToAll && !data.area && !data.userIds.length)
    throw new NewsError("NO_USERS_SELECTED", "Selecciona destinatarios");
  return serialNews(async (tx) => {
    const set = await tx.triviaQuestionSet.findUnique({
      where: { id: data.questionSetId, active: true, audience: "INTERNAL" },
      include: { questions: { where: { active: true }, include: { answers: true } } },
    });
    if (!set) throw new NewsError("SET_NOT_FOUND", "Comunicado no disponible", 404);
    if (
      data.includeTrivia &&
      (!set.questions.length ||
        set.questions.some(
          (q) => q.answers.length < 2 || q.answers.filter((a) => a.isCorrect).length !== 1
        ))
    )
      throw new NewsError(
        "TRIVIA_REQUIRED",
        "Configura preguntas con una respuesta correcta antes de exigir trivia"
      );
    const revision = await ensureNewsRevision(tx, set);
    const ids = [...new Set(data.userIds)];
    const users = await tx.user.findMany({
      where: {
        person: { active: true },
        ...(data.assignToAll
          ? {}
          : data.area
            ? { OR: [{ person: { area: data.area } }, { id: { in: ids } }] }
            : { id: { in: ids } }),
      },
      select: { id: true },
    });
    if (users.length > NEWS_POLICY.maxRecipients)
      throw new NewsError(
        "TOO_MANY_RECIPIENTS",
        "Selecciona un grupo más pequeño de destinatarios"
      );
    if (!users.length) throw new NewsError("NO_ACTIVE_USERS", "No hay destinatarios activos");
    if (!data.assignToAll && ids.some((id) => !users.some((user) => user.id === id)))
      throw new NewsError("INVALID_RECIPIENTS", "Algún destinatario no existe o está inactivo");
    const previous = await tx.commitmentAssignment.findMany({
      where: {
        questionSetId: set.id,
        userId: { in: users.map((user) => user.id) },
        revisionId: revision.id,
        status: { in: ["PENDING", "COMPLETED"] },
      },
      select: { userId: true },
    });
    const exists = new Set(previous.map((item) => item.userId));
    const rows = users
      .filter((user) => !exists.has(user.id))
      .map((user) => ({
        userId: user.id,
        questionSetId: set.id,
        revisionId: revision.id,
        requiredVersion: revision.version,
        status: "PENDING",
        includeTrivia: data.includeTrivia,
        mandatory: data.mandatory,
      }));
    const created = rows.length
      ? await tx.commitmentAssignment.createMany({ data: rows })
      : { count: 0 };
    return { count: created.count, skipped: users.length - created.count, total: users.length };
  });
}
export async function cancelNewsAssignment(id: string) {
  return serialNews(async (tx) => {
    const item = await tx.commitmentAssignment.findUnique({ where: { id } });
    if (!item) throw new NewsError("NOT_FOUND", "Asignación no encontrada", 404);
    if (item.status === "COMPLETED")
      throw new NewsError(
        "CANNOT_DELETE_COMPLETED",
        "No se puede cancelar una asignación completada",
        409
      );
    await tx.commitmentAssignment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    return { message: "Asignación cancelada; historial conservado" };
  });
}
export async function acceptNews(userId: string, input: unknown, inboxOnly = false) {
  const data = acceptanceSchema.parse(input);
  if (!data.assignmentId) {
    if (inboxOnly) throw new NewsError("MISSING_ID", "Asignación requerida");
    if (data.version !== CURRENT_REGULATION.version)
      throw new NewsError("INVALID_VERSION", "Actualiza el reglamento antes de aceptar");
    if (data.acceptOnly) return { accepted: true, completed: false };
    await prisma.user.updateMany({
      where: { id: userId, commitmentVersionAccepted: { lt: CURRENT_REGULATION.version } },
      data: {
        commitmentVersionAccepted: CURRENT_REGULATION.version,
        commitmentAcceptedAt: new Date(),
      },
    });
    return { completed: true };
  }
  return serialNews(async (tx) => {
    const item = await tx.commitmentAssignment.findFirst({
      where: { id: data.assignmentId, userId },
      include: { revision: true },
    });
    if (!item) throw new NewsError("NOT_FOUND", "Asignación no encontrada", 404);
    if (inboxOnly && item.mandatory)
      throw new NewsError(
        "MANDATORY_ASSIGNMENT",
        "Completa el comunicado obligatorio desde su ventana",
        409
      );
    if (item.status === "COMPLETED") return { completed: true, alreadyCompleted: true };
    if (item.status !== "PENDING")
      throw new NewsError("ASSIGNMENT_CANCELED", "Esta asignación fue cancelada", 409);
    if (data.acceptOnly) return { accepted: true, completed: false };
    const snapshot = assignedContent(item);
    if (item.includeTrivia) {
      const questions = snapshot.questions;
      if (!questions.length)
        throw new NewsError("TRIVIA_UNAVAILABLE", "El comunicado requiere preguntas válidas", 409);
      const supplied = data.answers || {};
      if (
        Object.keys(supplied).length !== questions.length ||
        questions.some((question) => !question.answers[supplied[question.id]]?.isCorrect)
      )
        throw new NewsError(
          "TRIVIA_NOT_PASSED",
          "Revisa tus respuestas y vuelve a intentarlo",
          422
        );
    }
    const result = await tx.commitmentAssignment.updateMany({
      where: { id: item.id, userId, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (!result.count)
      throw new NewsError("STATE_CHANGED", "La asignación cambió. Actualiza la página.", 409);
    await tx.eventLog.create({
      data: {
        type: "INTERNAL_NEWS_ACCEPTED",
        message: "Comunicado completado",
        metadata: JSON.stringify({
          assignmentId: item.id,
          userId,
          questionSetId: item.questionSetId,
          revisionId: item.revisionId,
          mandatory: item.mandatory,
          includeTrivia: item.includeTrivia,
          answers: item.includeTrivia ? data.answers : undefined,
          contentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        }),
      },
    });
    return { completed: true };
  });
}
export async function listNewsAssignments(search: URLSearchParams) {
  const { page, limit, status, questionSetId } = assignmentListSchema.parse({
    page: search.get("page") || undefined,
    limit: search.get("limit") || undefined,
    status: search.get("status") || undefined,
    questionSetId: search.get("questionSetId") || undefined,
  });
  if (!Number.isSafeInteger((page - 1) * limit))
    throw new NewsError("INVALID_PAGE", "Página inválida");
  const where = { ...(status ? { status } : {}), ...(questionSetId ? { questionSetId } : {}) };
  const [assignments, total] = await Promise.all([
    prisma.commitmentAssignment.findMany({
      where,
      select: assignmentSelect,
      orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
      skip: (Math.floor(page) - 1) * Math.floor(limit),
      take: Math.floor(limit),
    }),
    prisma.commitmentAssignment.count({ where }),
  ]);
  return { assignments, total, page, limit };
}
