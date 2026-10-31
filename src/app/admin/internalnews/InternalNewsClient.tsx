"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NewsContentFields } from "@/components/internal-news/NewsContentFields";
import {
  type NewsQuestionDraft,
  NewsQuestionFields,
} from "@/components/internal-news/NewsQuestionFields";
import { NewsRevisionHistory } from "@/components/internal-news/NewsRevisionHistory";
import { ALLOWED_AREAS } from "@/lib/areas";
import { questionCreateSchema } from "@/lib/internal-news/contracts";

type TabType = "overview" | "question-sets" | "questions" | "assignments";

type InternalNewsStats = {
  totalQuestionSets: number;
  activeQuestionSets: number;
  totalQuestions: number;
  activeQuestions: number;
  totalAssignments: number;
  completedAssignments: number;
  averageCompletionRate: number;
};

type NewQuestionSetForm = {
  name: string;
  description: string;
  regulationContent: string;
  active: boolean;
};

type NewQuestionForm = NewsQuestionDraft;

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

type NewsAssignment = {
  id: string;
  userId: string;
  questionSetId: string;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  includeTrivia: boolean;
  mandatory: boolean;
  assignedAt: string;
  completedAt: string | null;
  revision: { version: number } | null;
  user: {
    username: string;
    person: {
      name: string;
      area: string | null;
    };
  };
  questionSet: {
    name: string;
  };
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

export default function InternalNewsClient({
  initialQuestionSets,
  initialQuestions,
  initialStats,
  canAssign = false,
}: {
  initialQuestionSets: TriviaQuestionSetWithCounts[];
  initialQuestions: TriviaQuestionWithStats[];
  initialStats: InternalNewsStats;
  canAssign?: boolean;
}) {
  const router = useRouter();
  const [historySetId, setHistorySetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [questionSets, setQuestionSets] = useState(initialQuestionSets);
  const [questions, setQuestions] = useState(initialQuestions);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  // Assignments state
  const [assignments, setAssignments] = useState<NewsAssignment[]>([]);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [assignmentError, setAssignmentError] = useState("");
  const [allUsers, setAllUsers] = useState<
    Array<{ id: string; personName: string; area: string | null }>
  >([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    userIds: [] as string[],
    questionSetId: "",
    area: "",
    includeTrivia: false,
    mandatory: true,
    assignToAll: false,
  });

  // Load assignments
  const loadAssignments = async (page = 1) => {
    setLoading(true);
    setAssignmentError("");
    try {
      const response = await fetch(`/api/admin/trivia/assign?page=${page}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(data.message || "No se pudieron cargar las asignaciones");
      setAssignments((previous) =>
        page === 1 ? data.assignments : [...previous, ...data.assignments]
      );
      setAssignmentPage(page);
      setAssignmentTotal(data.total);
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const loadUsersForAssign = async () => {
    try {
      const response = await fetch("/api/admin/trivia/recipients", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(data.message || "No se pudieron cargar los destinatarios");
      setAllUsers(data.users);
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Error de conexión");
    }
  };

  useEffect(() => {
    if (activeTab === "assignments" && canAssign) {
      loadAssignments();
      loadUsersForAssign();
    }
  }, [activeTab, canAssign]);

  // Estados para modales
  const [showCreateQuestionSetModal, setShowCreateQuestionSetModal] = useState(false);
  const [showEditQuestionSetModal, setShowEditQuestionSetModal] = useState(false);
  const [editingQuestionSet, setEditingQuestionSet] = useState<TriviaQuestionSetWithCounts | null>(
    null
  );
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState(false);
  const [showEditQuestionModal, setShowEditQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<TriviaQuestionWithStats | null>(null);

  // Formularios
  const [questionSetForm, setQuestionSetForm] = useState<NewQuestionSetForm>({
    name: "",
    description: "",
    regulationContent: "",
    active: true,
  });

  const [questionForm, setQuestionForm] = useState<NewQuestionForm>({
    questionSetId: "",
    question: "",
    order: 1,
    pointsForCorrect: 10,
    pointsForIncorrect: 0,
    active: true,
    answers: [
      { answer: "", isCorrect: false, order: 1 },
      { answer: "", isCorrect: false, order: 2 },
      { answer: "", isCorrect: false, order: 3 },
      { answer: "", isCorrect: false, order: 4 },
    ],
  });

  const [formErrors, setFormErrors] = useState<string[]>([]);

  useEffect(() => setQuestionSets(initialQuestionSets), [initialQuestionSets]);
  useEffect(() => setQuestions(initialQuestions), [initialQuestions]);
  useEffect(() => setStats(initialStats), [initialStats]);
  const refreshData = async () => {
    router.refresh();
  };

  const handleCreateQuestionSet = async () => {
    const errors: string[] = [];

    if (!questionSetForm.name.trim()) {
      errors.push("El nombre es requerido");
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setLoading(true);
    setFormErrors([]);

    try {
      const response = await fetch("/api/trivia/question-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionSetForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al crear comunicado");
      }

      setShowCreateQuestionSetModal(false);
      setQuestionSetForm({
        name: "",
        description: "",
        regulationContent: "",
        active: true,
      });

      await refreshData();
    } catch (error) {
      console.error("Error creating question set:", error);
      setFormErrors([error instanceof Error ? error.message : "Error desconocido"]);
    } finally {
      setLoading(false);
    }
  };

  const handleEditQuestionSet = (questionSet: TriviaQuestionSetWithCounts) => {
    setEditingQuestionSet(questionSet);
    setQuestionSetForm({
      name: questionSet.name,
      description: questionSet.description || "",
      regulationContent: questionSet.regulationContent || "",
      active: questionSet.active,
    });
    setShowEditQuestionSetModal(true);
  };

  const handleUpdateQuestionSet = async () => {
    if (!editingQuestionSet) return;

    const errors: string[] = [];

    if (!questionSetForm.name.trim()) {
      errors.push("El nombre es requerido");
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setLoading(true);
    setFormErrors([]);

    try {
      const response = await fetch(`/api/trivia/question-sets/${editingQuestionSet.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionSetForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al actualizar comunicado");
      }

      setShowEditQuestionSetModal(false);
      setEditingQuestionSet(null);
      setQuestionSetForm({
        name: "",
        description: "",
        regulationContent: "",
        active: true,
      });

      await refreshData();
    } catch (error) {
      console.error("Error updating question set:", error);
      setFormErrors([error instanceof Error ? error.message : "Error desconocido"]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestionSet = async (questionSet: TriviaQuestionSetWithCounts) => {
    if (
      !confirm(
        `¿Estás seguro de que quieres archivar el comunicado "${questionSet.name}"? El historial se conservará.`
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/trivia/question-sets/${questionSet.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al archivar comunicado");
      }

      await refreshData();
    } catch (error) {
      console.error("Error deleting question set:", error);
      alert(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleEditQuestion = (question: TriviaQuestionWithStats) => {
    setEditingQuestion(question);
    setQuestionForm({
      questionSetId: question.questionSetId || "",
      question: question.question,
      order: question.order,
      pointsForCorrect: question.pointsForCorrect ?? 10,
      pointsForIncorrect: question.pointsForIncorrect ?? 0,
      active: question.active,
      answers: question.answers.map((a) => ({
        answer: a.answer,
        isCorrect: a.isCorrect,
        order: a.order,
      })),
    });
    setShowEditQuestionModal(true);
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;

    const parsed = questionCreateSchema.safeParse({
      ...questionForm,
      answers: questionForm.answers.filter((a) => a.answer.trim()),
    });
    if (!parsed.success) {
      setFormErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }

    setLoading(true);
    setFormErrors([]);

    try {
      const response = await fetch(`/api/trivia/questions/${editingQuestion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al actualizar pregunta");
      }

      setShowEditQuestionModal(false);
      setEditingQuestion(null);
      setQuestionForm({
        questionSetId: "",
        question: "",
        order: 1,
        pointsForCorrect: 10,
        pointsForIncorrect: 0,
        active: true,
        answers: [
          { answer: "", isCorrect: false, order: 1 },
          { answer: "", isCorrect: false, order: 2 },
          { answer: "", isCorrect: false, order: 3 },
          { answer: "", isCorrect: false, order: 4 },
        ],
      });

      await refreshData();
    } catch (error) {
      console.error("Error updating question:", error);
      setFormErrors([error instanceof Error ? error.message : "Error desconocido"]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (question: TriviaQuestionWithStats) => {
    if (
      !confirm(
        `¿Estás seguro de que quieres archivar la pregunta "${question.question}"? El historial se conservará.`
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/trivia/questions/${question.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al archivar pregunta");
      }

      await refreshData();
    } catch (error) {
      console.error("Error deleting question:", error);
      alert(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuestion = async () => {
    const parsed = questionCreateSchema.safeParse({
      ...questionForm,
      answers: questionForm.answers.filter((a) => a.answer.trim()),
    });
    if (!parsed.success) {
      setFormErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }

    setLoading(true);
    setFormErrors([]);

    try {
      const response = await fetch("/api/trivia/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error al crear pregunta");
      }

      setShowCreateQuestionModal(false);
      setQuestionForm({
        questionSetId: "",
        question: "",
        order: 1,
        pointsForCorrect: 10,
        pointsForIncorrect: 0,
        active: true,
        answers: [
          { answer: "", isCorrect: false, order: 1 },
          { answer: "", isCorrect: false, order: 2 },
          { answer: "", isCorrect: false, order: 3 },
          { answer: "", isCorrect: false, order: 4 },
        ],
      });

      await refreshData();
    } catch (error) {
      console.error("Error creating question:", error);
      setFormErrors([error instanceof Error ? error.message : "Error desconocido"]);
    } finally {
      setLoading(false);
    }
  };

  const deleteAssignment = async (assignmentId: string) => {
    if (
      !confirm("¿Estás seguro de que quieres cancelar esta asignación? El historial se conservará.")
    ) {
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`/api/admin/trivia/assignments/${assignmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (r.ok) {
        alert("Asignación cancelada; historial conservado");
        await loadAssignments();
      } else {
        const error = await r.json();
        alert(`Error: ${error.message || "Error desconocido"}`);
      }
    } catch (error) {
      console.error("Error deleting assignment:", error);
      alert("Error al cancelar la asignación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {historySetId && (
        <NewsRevisionHistory
          key={historySetId}
          setId={historySetId}
          onClose={() => setHistorySetId(null)}
        />
      )}
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Comunicados</h3>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.totalQuestionSets}
          </p>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {stats.activeQuestionSets} activos
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Preguntas</h3>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {stats.totalQuestions}
          </p>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {stats.activeQuestions} activas
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Asignaciones</h3>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {stats.totalAssignments}
          </p>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {stats.completedAssignments} completadas ({stats.averageCompletionRate}%)
          </p>
        </div>
      </div>

      {/* Pestañas */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "overview", label: "Resumen", count: null },
            { id: "question-sets", label: "Comunicados", count: stats.totalQuestionSets },
            { id: "questions", label: "Preguntas", count: stats.totalQuestions },
            ...(canAssign
              ? [{ id: "assignments", label: "Asignaciones", count: assignmentTotal }]
              : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600"
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span
                  className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                    activeTab === tab.id
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenido de pestañas */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {activeTab === "overview" && "Resumen del Sistema de Trivia"}
          {activeTab === "question-sets" && "Comunicados"}
          {activeTab === "questions" && "Preguntas"}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={refreshData}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          {activeTab === "question-sets" && (
            <button
              onClick={() => setShowCreateQuestionSetModal(true)}
              className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
            >
              Nuevo Comunicado
            </button>
          )}
          {activeTab === "questions" && (
            <button
              onClick={() => setShowCreateQuestionModal(true)}
              className="px-4 py-2 bg-purple-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-purple-700"
            >
              Nueva Pregunta
            </button>
          )}
          {activeTab === "assignments" && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700"
            >
              Asignar Trivia
            </button>
          )}
        </div>
      </div>

      {/* Contenido de pestañas */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {historySetId && (
            <NewsRevisionHistory
              key={historySetId}
              setId={historySetId}
              onClose={() => setHistorySetId(null)}
            />
          )}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">
              Estado del Sistema
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-slate-100 mb-2">
                  Comunicados Recientes
                </h4>
                <div className="space-y-2">
                  {questionSets.slice(0, 3).map((set) => (
                    <div
                      key={set.id}
                      className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-700 rounded"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                        {set.name}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          set.active
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                            : "bg-gray-100 dark:bg-slate-600 text-gray-800 dark:text-slate-300"
                        }`}
                      >
                        {set.questionCount} preguntas
                      </span>
                    </div>
                  ))}
                  {questionSets.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 italic">
                      No hay comunicados
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "question-sets" && (
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg border border-slate-200 dark:border-slate-700">
          {questionSets.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-slate-400">
              No hay comunicados configurados aún.
              <br />
              Crea el primero para comenzar.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {questionSets.map((set) => (
                <div key={set.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                          {set.name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            set.active
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                              : "bg-gray-100 dark:bg-slate-600 text-gray-800 dark:text-slate-300"
                          }`}
                        >
                          {set.active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      {set.description && (
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-2">
                          {set.description}
                        </p>
                      )}
                      <div className="flex gap-4 text-sm text-gray-500 dark:text-slate-400">
                        <span>{set.questionCount} preguntas</span>
                        <span>{set.assignmentCount} asignaciones</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn text-sm" onClick={() => setHistorySetId(set.id)}>
                        Revisiones
                      </button>
                      <button
                        onClick={() => handleEditQuestionSet(set)}
                        className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteQuestionSet(set)}
                        className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        Archivar
                      </button>
                      <div className="text-xs text-gray-400 dark:text-slate-500 ml-4">
                        Creado: {new Date(set.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "questions" && (
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg border border-slate-200 dark:border-slate-700">
          {questions.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-slate-400">
              No hay preguntas configuradas aún.
              <br />
              Crea la primera pregunta para comenzar.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {questions.map((question) => (
                <div key={question.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
                          #{question.order}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            question.active
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                              : "bg-gray-100 dark:bg-slate-600 text-gray-800 dark:text-slate-300"
                          }`}
                        >
                          {question.active ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100 mb-2">
                        {question.question}
                      </h3>
                      <div className="space-y-1">
                        {question.answers ? (
                          question.answers.map((answer) => (
                            <div
                              key={answer.id}
                              className={`text-sm p-2 rounded ${
                                answer.isCorrect
                                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                                  : "bg-gray-50 dark:bg-slate-700"
                              }`}
                            >
                              {answer.isCorrect && (
                                <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                              )}
                              <span className="text-gray-900 dark:text-slate-100">
                                {answer.answer}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 dark:text-slate-400 italic">
                            No hay respuestas configuradas
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <div className="text-sm text-gray-500 dark:text-slate-400"></div>
                      <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                        {question.correctAnswerCount} respuesta(s) correcta(s)
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleEditQuestion(question)}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(question)}
                          className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          Archivar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {questions.length === 0 && !loading && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow border border-gray-200 dark:border-slate-700 p-8 text-center">
              <p className="text-gray-500 dark:text-slate-400 italic">
                No hay preguntas configuradas
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "assignments" && (
        <div className="space-y-6">
          {historySetId && (
            <NewsRevisionHistory
              key={historySetId}
              setId={historySetId}
              onClose={() => setHistorySetId(null)}
            />
          )}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
              Gestión de Cumplimiento
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Usa esta sección para asignar trivias específicas a áreas completas o personas
              individuales como requisito complementario al contrato. Solo los obligatorios abren la
              ventana al ingresar. Los demás quedan en la bandeja; la trivia se exige cuando está
              activada.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Colaborador
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Contenido
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Trivia?
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Obligat.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Fecha Asignación
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Completado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                          {assignment.user.person.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {assignment.user.person.area || "Sin área"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-slate-100 font-mono">
                          {assignment.questionSet.name}{" "}
                          {assignment.revision && (
                            <span className="text-xs text-slate-500">
                              · v{assignment.revision.version}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {assignment.includeTrivia ? (
                          <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                            SÍ
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {assignment.mandatory ? (
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-bold bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                            SÍ
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            assignment.status === "COMPLETED"
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                              : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"
                          }`}
                        >
                          {assignment.status === "COMPLETED"
                            ? "Completado"
                            : assignment.status === "SKIPPED"
                              ? "Cancelado"
                              : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                        {new Date(assignment.assignedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                        {assignment.completedAt
                          ? new Date(assignment.completedAt).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => deleteAssignment(assignment.id)}
                          disabled={loading || assignment.status !== "PENDING"}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancelar asignación"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            ></path>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {assignments.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-10 text-center text-sm text-gray-500 dark:text-slate-400 italic"
                      >
                        No hay asignaciones registradas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {assignmentError && (
                <p role="alert" className="p-3 text-red-600">
                  {assignmentError}
                </p>
              )}
              {assignments.length < assignmentTotal && (
                <button
                  className="btn m-3"
                  disabled={loading}
                  onClick={() => loadAssignments(assignmentPage + 1)}
                >
                  Cargar más asignaciones
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Question Set */}
      {showCreateQuestionSetModal && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-slate-900 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                  Nuevo Comunicado
                </h3>
                <button
                  onClick={() => setShowCreateQuestionSetModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>

              {formErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <ul className="text-sm text-red-600 dark:text-red-400">
                    {formErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <NewsContentFields value={questionSetForm} onChange={setQuestionSetForm} />

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCreateQuestionSetModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateQuestionSet}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Creando..." : "Crear Set"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Comunicado */}
      {showEditQuestionSetModal && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-slate-900 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                  Editar Comunicado
                </h3>
                <button
                  onClick={() => {
                    setShowEditQuestionSetModal(false);
                    setEditingQuestionSet(null);
                    setQuestionSetForm({
                      name: "",
                      description: "",
                      regulationContent: "",
                      active: true,
                    });
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>

              {formErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <ul className="text-sm text-red-600 dark:text-red-400">
                    {formErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <NewsContentFields value={questionSetForm} onChange={setQuestionSetForm} />

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowEditQuestionSetModal(false);
                    setEditingQuestionSet(null);
                    setQuestionSetForm({
                      name: "",
                      description: "",
                      regulationContent: "",
                      active: true,
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateQuestionSet}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Actualizando..." : "Actualizar Set"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Pregunta */}
      {showCreateQuestionModal && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-slate-900 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                  Nueva Pregunta de Trivia
                </h3>
                <button
                  onClick={() => setShowCreateQuestionModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>

              {formErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <ul className="text-sm text-red-600 dark:text-red-400">
                    {formErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <NewsQuestionFields
                value={questionForm}
                onChange={setQuestionForm}
                sets={questionSets}
              />

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCreateQuestionModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateQuestion}
                  disabled={loading}
                  className="px-4 py-2 bg-purple-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? "Creando..." : "Crear Pregunta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Pregunta de Trivia */}
      {showEditQuestionModal && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-slate-900 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                  Editar Pregunta de Trivia
                </h3>
                <button
                  onClick={() => {
                    setShowEditQuestionModal(false);
                    setEditingQuestion(null);
                    setQuestionForm({
                      questionSetId: "",
                      question: "",
                      order: 1,
                      pointsForCorrect: 10,
                      pointsForIncorrect: 0,
                      active: true,
                      answers: [
                        { answer: "", isCorrect: false, order: 1 },
                        { answer: "", isCorrect: false, order: 2 },
                        { answer: "", isCorrect: false, order: 3 },
                        { answer: "", isCorrect: false, order: 4 },
                      ],
                    });
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>

              {formErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <ul className="text-sm text-red-600 dark:text-red-400">
                    {formErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <NewsQuestionFields
                value={questionForm}
                onChange={setQuestionForm}
                sets={questionSets}
              />

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowEditQuestionModal(false);
                    setEditingQuestion(null);
                    setQuestionForm({
                      questionSetId: "",
                      question: "",
                      order: 1,
                      pointsForCorrect: 10,
                      pointsForIncorrect: 0,
                      active: true,
                      answers: [
                        { answer: "", isCorrect: false, order: 1 },
                        { answer: "", isCorrect: false, order: 2 },
                        { answer: "", isCorrect: false, order: 3 },
                        { answer: "", isCorrect: false, order: 4 },
                      ],
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateQuestion}
                  disabled={loading}
                  className="px-4 py-2 bg-purple-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? "Actualizando..." : "Actualizar Pregunta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar Trivia */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-gray-600 dark:bg-slate-900 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">
                  Asignar Trivia Dirigida
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Set de Trivia (Contenido)
                  </label>
                  <select
                    value={assignForm.questionSetId}
                    onChange={(e) =>
                      setAssignForm({ ...assignForm, questionSetId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                  >
                    <option value="">Seleccionar set...</option>
                    {questionSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name} ({set.questionCount} preguntas)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Requerir Trivia de Conocimiento
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Si se desactiva, solo se les pedirá leer y firmar el comunicado.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAssignForm({ ...assignForm, includeTrivia: !assignForm.includeTrivia })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      assignForm.includeTrivia ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        assignForm.includeTrivia ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                      Lectura obligatoria al iniciar sesión
                    </label>
                    <p className="text-xs text-amber-600 dark:text-amber-300">
                      Si se desactiva, el comunicado solo aparecerá en la bandeja de Novedades (no
                      bloqueará el login).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAssignForm({ ...assignForm, mandatory: !assignForm.mandatory })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      assignForm.mandatory ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        assignForm.mandatory ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">
                    ¿A quiénes asignar?
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex-1">
                        <label className="text-sm font-semibold text-green-800 dark:text-green-200">
                          Opción A: TODOS los colaboradores
                        </label>
                        <p className="text-xs text-green-600 dark:text-green-300">
                          Asignar a todos los colaboradores activos del sistema.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={assignForm.assignToAll}
                        onChange={(e) =>
                          setAssignForm({
                            ...assignForm,
                            assignToAll: e.target.checked,
                            area: "",
                            userIds: [],
                          })
                        }
                        className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Opción B: Por Área
                      </label>
                      <select
                        value={assignForm.area}
                        onChange={(e) =>
                          setAssignForm({
                            ...assignForm,
                            area: e.target.value,
                            userIds: [],
                            assignToAll: false,
                          })
                        }
                        className="w-full px-3 py-2 border border-blue-200 dark:border-blue-900/30 rounded-md bg-blue-50/30 dark:bg-blue-900/10 text-gray-900 dark:text-slate-100"
                        disabled={assignForm.assignToAll}
                      >
                        <option value="">-- No filtrar por área --</option>
                        {ALLOWED_AREAS.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Opción C: Colaboradores específicos
                      </label>
                      <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-slate-600 rounded-md p-2 space-y-1">
                        {allUsers
                          .filter((u) => !assignForm.area || u.area === assignForm.area)
                          .map((u) => (
                            <label
                              key={u.id}
                              className="flex items-center text-sm p-1 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded pointer"
                            >
                              <input
                                type="checkbox"
                                checked={assignForm.userIds.includes(u.id)}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setAssignForm({
                                      ...assignForm,
                                      userIds: [...assignForm.userIds, u.id],
                                      area: "",
                                      assignToAll: false,
                                    });
                                  else
                                    setAssignForm({
                                      ...assignForm,
                                      userIds: assignForm.userIds.filter((id) => id !== u.id),
                                    });
                                }}
                                className="mr-2"
                                disabled={assignForm.assignToAll}
                              />
                              <span className={assignForm.assignToAll ? "text-gray-400" : ""}>
                                {u.personName}{" "}
                                <span className="text-xs text-gray-400">({u.area})</span>
                              </span>
                            </label>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (!assignForm.questionSetId) return alert("Selecciona una trivia");
                      if (
                        !assignForm.assignToAll &&
                        assignForm.userIds.length === 0 &&
                        !assignForm.area
                      )
                        return alert("Selecciona destinatarios");

                      setLoading(true);
                      try {
                        const r = await fetch("/api/admin/trivia/assign", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(assignForm),
                        });
                        if (!r.ok) {
                          const body = await r.json();
                          throw new Error(body.message || "No se pudo asignar el comunicado");
                        }
                        if (r.ok) {
                          const result = await r.json();
                          alert(
                            `Comunicados asignados: ${result.count}. Ya existentes: ${result.skipped}.`
                          );
                          setShowAssignModal(false);
                          loadAssignments();
                        }
                      } catch {
                        alert("No se pudo asignar el comunicado");
                      }
                      setLoading(false);
                    }}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? "Asignando..." : "Confirmar Asignación"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
