import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyUserSessionCookie } from "@/lib/auth";
import { NEWS_POLICY } from "@/lib/internal-news/contracts";
import { sanitizeNewsHtml } from "@/lib/internal-news/html";
import { prisma } from "@/lib/prisma";

import InternalNewsClient from "./InternalNewsClient";

export const metadata = { title: "Comunicados internos" };
export const dynamic = "force-dynamic";

type TriviaQuestionSetWithCounts = {
  id: string;
  name: string;
  description: string | null;
  regulationContent: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  assignmentCount: number;
};

type TriviaAnswer = {
  id: string;
  questionId: string;
  answer: string;
  isCorrect: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

type TriviaQuestionWithStats = {
  id: string;
  questionSetId: string | null;
  question: string;
  order: number;
  pointsForCorrect: number;
  pointsForIncorrect: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  answers: TriviaAnswer[];
  answerCount: number;
  correctAnswerCount: number;
};

type InternalNewsStats = {
  totalQuestionSets: number;
  activeQuestionSets: number;
  totalQuestions: number;
  activeQuestions: number;
  totalAssignments: number;
  completedAssignments: number;
  averageCompletionRate: number;
};

async function getInternalNewsData(): Promise<{
  questionSets: TriviaQuestionSetWithCounts[];
  questions: TriviaQuestionWithStats[];
  stats: InternalNewsStats;
}> {
  // Obtener sets de preguntas con conteos
  const questionSets = await prisma.triviaQuestionSet.findMany({
    where: { audience: "INTERNAL" },
    include: {
      _count: {
        select: {
          questions: true,
          commitmentAssignments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calcular conteo de sesiones por question set
  const questionSetsWithCounts = questionSets.map((set) => ({
    ...set,
    regulationContent: sanitizeNewsHtml(set.regulationContent),
    questionCount: set._count.questions,
    assignmentCount: set._count.commitmentAssignments,
  }));

  // Obtener preguntas con estadísticas
  const questions = await prisma.triviaQuestion.findMany({
    where: { questionSet: { audience: "INTERNAL" } },
    include: {
      answers: {
        orderBy: { order: "asc" },
      },
      _count: {
        select: {
          answers: true,
        },
      },
    },
    orderBy: { order: "asc" },
  });

  const questionsWithStats = questions.map((question) => ({
    ...question,
    answerCount: question._count.answers,
    correctAnswerCount: question.answers.filter((a) => a.isCorrect).length,
  }));

  // Calcular estadísticas generales
  const totalQuestionSets = questionSets.length;
  const activeQuestionSets = questionSets.filter((s) => s.active).length;
  const totalQuestions = questions.length;
  const activeQuestions = questions.filter((q) => q.active).length;

  const [totalAssignments, completedAssignments] = await Promise.all([
    prisma.commitmentAssignment.count({ where: { status: { not: "SKIPPED" } } }),
    prisma.commitmentAssignment.count({ where: { status: "COMPLETED" } }),
  ]);
  const averageCompletionRate =
    totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0;

  const stats: InternalNewsStats = {
    totalQuestionSets,
    activeQuestionSets,
    totalQuestions,
    activeQuestions,
    totalAssignments,
    completedAssignments,
    averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
  };

  return {
    questionSets: questionSetsWithCounts,
    questions: questionsWithStats,
    stats,
  };
}

export default async function InternalNewsPage() {
  const session = await verifyUserSessionCookie(cookies().get("user_session")?.value);
  if (!session) redirect("/u/login");
  if (!(NEWS_POLICY.contentRoles as readonly string[]).includes(session.role)) redirect("/u");
  const canAssign = (NEWS_POLICY.assignmentRoles as readonly string[]).includes(session.role);
  const { questionSets, questions, stats } = await getInternalNewsData();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Comunicados internos</h1>
        <p className="text-gray-600">
          Gestiona comunicados obligatorios, novedades y sus preguntas de conocimiento
        </p>
      </div>

      <InternalNewsClient
        initialQuestionSets={questionSets}
        initialQuestions={questions}
        initialStats={stats}
        canAssign={canAssign}
      />
    </div>
  );
}
