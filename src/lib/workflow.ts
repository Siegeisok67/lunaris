import type { BlueprintRevision, ExecutorTurn, PromptSession, WorkflowStage, WorkflowStageProgress, WorkflowStageStatus } from "../types/architect";

const WORKFLOW_STATUSES = new Set<WorkflowStageStatus>(["pending", "in_progress", "needs_changes", "verified"]);

export function isSoftwareRequest(prompt: string): boolean {
  return /\b(?:app(?:lication)?|website|web app|software|desktop|mobile|game|api|service|platform|program|tool|saas)\b/i.test(prompt);
}

export function defaultSoftwareStages(): WorkflowStage[] {
  return [
    { id: "first-draft", title: "First working draft", goal: "Build the smallest end-to-end version that demonstrates the core idea.", deliverable: "A runnable first draft with the primary user flow.", verification: "Start the app and walk through the main flow; record errors and missing pieces." },
    { id: "verify-core", title: "Test the core experience", goal: "Check the first draft against the intended behavior before expanding scope.", deliverable: "A short verification report with issues and fixes needed.", verification: "Run available tests or manual checks, verify the main flow, and note any failures honestly." },
    { id: "expand-features", title: "Expand the key features", goal: "Add the next most valuable features while preserving the working core.", deliverable: "The requested feature set integrated into the existing draft.", verification: "Run relevant tests and exercise the original core flow again." },
    { id: "polish-release", title: "Polish and regression check", goal: "Improve accessibility, error states, and visual consistency; prepare a clean handoff.", deliverable: "A polished build with an implementation summary.", verification: "Build the project, run applicable checks, and review changed screens at the target size." },
  ];
}

export function normalizeWorkflowStages(value: unknown): WorkflowStage[] {
  if (!Array.isArray(value)) return [];
  const stages: WorkflowStage[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 48) : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim().slice(0, 100) : "";
    const goal = typeof candidate.goal === "string" ? candidate.goal.trim().slice(0, 1000) : "";
    const deliverable = typeof candidate.deliverable === "string" ? candidate.deliverable.trim().slice(0, 800) : "";
    const verification = typeof candidate.verification === "string" ? candidate.verification.trim().slice(0, 800) : "";
    if (!id || !title || !goal || !deliverable || !verification || seen.has(id)) continue;
    seen.add(id);
    stages.push({ id, title, goal, deliverable, verification });
  }
  return stages;
}

export function stagesForRequest(prompt: string, suggested: WorkflowStage[] | undefined): WorkflowStage[] {
  const normalized = normalizeWorkflowStages(suggested);
  if (normalized.length >= 3) return normalized;
  return isSoftwareRequest(prompt) ? defaultSoftwareStages() : normalized;
}

export function normalizeStageProgress(value: unknown, stages: WorkflowStage[]): WorkflowStageProgress[] {
  if (!Array.isArray(value)) return [];
  const stageIds = new Set(stages.map((stage) => stage.id));
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.stageId !== "string" || !stageIds.has(candidate.stageId) || !WORKFLOW_STATUSES.has(candidate.status as WorkflowStageStatus)) return [];
    return [{
      stageId: candidate.stageId,
      status: candidate.status as WorkflowStageStatus,
      evidence: typeof candidate.evidence === "string" ? candidate.evidence.slice(0, 4000) : "",
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt.slice(0, 40) : "",
    }];
  });
}

export function normalizeExecutorConversation(value: unknown): ExecutorTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-60).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !["user", "assistant"].includes(String(candidate.role)) || typeof candidate.content !== "string") return [];
    return [{
      id: candidate.id.slice(0, 80),
      role: candidate.role as ExecutorTurn["role"],
      stageId: typeof candidate.stageId === "string" ? candidate.stageId.slice(0, 48) : null,
      content: candidate.content.slice(0, 20_000),
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt.slice(0, 40) : "",
    }];
  });
}

export function normalizeBlueprintRevisions(value: unknown): BlueprintRevision[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.text !== "string") return [];
    return [{
      id: candidate.id.slice(0, 80),
      text: candidate.text.slice(0, 100_000),
      result: candidate.result && typeof candidate.result === "object" ? candidate.result as BlueprintRevision["result"] : null,
      stages: normalizeWorkflowStages(candidate.stages),
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt.slice(0, 40) : "",
      reason: typeof candidate.reason === "string" ? candidate.reason.slice(0, 200) : "Revision",
    }];
  });
}

export function makeBlueprintRevision(session: PromptSession, text: string, reason: string): BlueprintRevision {
  return {
    id: crypto.randomUUID(),
    text: text.slice(0, 100_000),
    result: session.result,
    stages: normalizeWorkflowStages(session.workflowStages),
    createdAt: new Date().toISOString(),
    reason: reason.trim().slice(0, 200) || "Blueprint update",
  };
}

export function compileStagePrompt(blueprint: string, stage: WorkflowStage, completedStages: WorkflowStageProgress[]): string {
  const completed = completedStages.filter((progress) => progress.status === "verified");
  const completedSummary = completed.length
    ? completed.map((progress) => "- " + progress.stageId + ": verified by the user" + (progress.evidence ? " — " + progress.evidence.slice(0, 500) : "")).join("\n")
    : "No earlier stage has been user-verified.";
  return blueprint + "\n\n# Current Design Studio stage: " + stage.title + "\n\nGoal: " + stage.goal + "\nDeliverable: " + stage.deliverable + "\nVerification expected: " + stage.verification + "\n\nPrior stage status:\n" + completedSummary + "\n\nWork only on this stage. Do not start later stages or mark this stage verified. Inspect the available project and tools first. If you can run checks in your environment, run the relevant checks and report the exact command and result. If you cannot access the project or test runner, give the user precise manual test steps. Summarize changed files, evidence, failures, and remaining work.";
}
