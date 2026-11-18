export type SpecValue = string | number | boolean | string[] | null;
export type SpecSheet = Record<string, SpecValue>;

export interface QuestionCard {
  id: string;
  question: string;
  options?: string[];
}

export interface WorkflowStage {
  id: string;
  title: string;
  goal: string;
  deliverable: string;
  verification: string;
}

export type WorkflowStageStatus = "pending" | "in_progress" | "needs_changes" | "verified";

export interface WorkflowStageProgress {
  stageId: string;
  status: WorkflowStageStatus;
  evidence: string;
  updatedAt: string;
}

export interface ExecutorTurn {
  id: string;
  role: "user" | "assistant";
  stageId: string | null;
  content: string;
  createdAt: string;
}

export interface BlueprintRevision {
  id: string;
  text: string;
  result: ArchitectResult | null;
  stages: WorkflowStage[];
  createdAt: string;
  reason: string;
}

export interface ArchitectResult {
  known_specs: SpecSheet;
  detected_skills: string[];
  detected_tools?: string[];
  is_ready_to_execute: boolean;
  next_questions: QuestionCard[];
  final_execution_prompt: string;
  workflow_stages?: WorkflowStage[];
  executor_recommendation?: {
    model: string;
    rationale: string;
    capabilities: string[];
  } | null;
  context_recommendation?: {
    architect_tokens: number;
    executor_tokens: number;
    rationale: string;
  } | null;
}

export interface AnswerRecord {
  questionId: string;
  questionText?: string;
  answer: string;
}

export type LoopStatus = "idle" | "evaluating" | "questioning" | "compiling" | "ready" | "error";

export interface LoopState {
  status: LoopStatus;
  originalPrompt: string;
  answers: AnswerRecord[];
  result: ArchitectResult | null;
  error: string | null;
  turn: number;
  skippedQuestions: boolean;
}

export interface ReferenceImage {
  id: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface PromptSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  result: ArchitectResult | null;
  answers: AnswerRecord[];
  compiledPrompt: string;
  answerCount: number;
  skippedQuestions: boolean;
  pinned?: boolean;
  archived?: boolean;
  completedChecklistSteps?: string[];
  projectId?: string | null;
  includeMemory?: boolean;
  workflowStages?: WorkflowStage[];
  stageProgress?: WorkflowStageProgress[];
  executorConversation?: ExecutorTurn[];
  blueprintRevisions?: BlueprintRevision[];
}

export const EMPTY_ARCHITECT_RESULT: ArchitectResult = {
  known_specs: {},
  detected_skills: [],
  is_ready_to_execute: false,
  next_questions: [],
  final_execution_prompt: "",
};
