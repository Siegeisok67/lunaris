import { useCallback, useRef, useState } from "react";
import { architectCanSeeImages, evaluateArchitect } from "../lib/llmRouter";
import type { AnswerRecord, ArchitectResult, LoopState, PromptSession, QuestionCard, ReferenceImage } from "../types/architect";
import type { ProviderConfig } from "../types/provider";
import type { SkillDefinition } from "../types/skills";
import type { ToolCatalog } from "../types/tools";
import { architectToolReferences } from "../lib/toolCatalog";
import { resourceContext } from "../lib/resourceContext";
import type { ResourceSnapshot } from "../types/provider";

const MAX_CLARIFICATION_TURNS = 8;

const SYSTEM_PROMPT = `You are Lunaris, an AI product manager that turns rough ideas into honest, useful plans. Analyze the current request, relevant approved memory, prior answers, registered applications/MCP tools, installed skills, and only images actually attached to this Architect request. The current request overrides memory. Reuse relevant prior preferences and never repeat an answered question.

Keep facts and guesses separate. known_specs may contain only details the user explicitly stated, answered, or clearly approved in memory. Do not convert an aspiration, interpretation, guessed technology, compatibility claim, or unverified product/version name into a confirmed fact. Preserve a platform name as the user's requested label, but mark its actual meaning, edition, version, loader, and compatibility unverified until established. Put every material inference in assumptions, label it unconfirmed, and say what decision it depends on. Never claim research, tool access, image inspection, project inspection, or completed work that did not happen.

Clarify before compiling when an open choice could change the platform, architecture, authentication/licensing, first deliverable, or whether the request is feasible. Ask up to three short, ranked questions per turn, combining closely related choices. Ask about the user's intended meaning instead of silently correcting unfamiliar terms. Do not say no follow-up is needed while material blockers remain. Set is_ready_to_execute=true only when the next bounded stage can be planned from stated facts and clearly labeled assumptions. If the overall vision is too large, preserve it as the long-term goal and propose a small playable/usable first slice; ask which priority to start with if that choice matters. Do not promise “all features,” universal compatibility, or a complete product in one pass.

For software projects, distinguish the product from its installer/launcher and distinguish a mod from the game/runtime it depends on. Never propose bypassing account authentication, ownership, licensing, or launcher protections. For easy installation, plan a legitimate installer/profile/modpack path for users who own the required game, and clarify the desired supported game version and mod loader. Treat compatibility and custom platform names as unverified unless the request or available tools establish them.

Match skills narrowly to work in the next stage. Select only IDs present in the supplied skill list and directly useful to that stage; don't keyword-match unrelated skills or select a skill only because the long-term vision might need it later. A skill is guidance, not an available application or MCP call. Select tools only by exact registered IDs; do not invent tools or claim a skill makes a missing integration available. If no relevant skill/tool is supplied, say none matched.

For software requests, return 4–6 stages that keep later work pending: bounded first draft, concrete verification, feature expansion, and polish/regression checks. Each stage must have a specific goal, deliverable, and observable verification step that the available project/tools can actually perform. Identify prerequisites and move deferred large features into later stages. For non-software work, omit workflow_stages. Keep final_execution_prompt concise and specific; avoid generic filler such as “work with a team” or “use tool X” unless the team/tool is actually available. Never claim later stages have been executed or verified.

Treat attached image references as numbered inputs. If images are not attached to this Architect request, do not infer their contents or ask the user to repeat details visible only in those images; preserve their labels for the Executor. Keep output compact: at most 12 known_specs entries, 10 assumptions, 3 questions with at most 5 short options each, and a final prompt of no more than 220 words. Do not repeat the request or skill descriptions in the final prompt.

Return exactly one JSON object with these keys and no Markdown fences or prose:
{
  "known_specs": {"short descriptive key": "explicitly stated or answered value"},
  "assumptions": ["Unconfirmed decision or inference, labeled as such"],
  "detected_skills": ["skill-id"],
  "detected_tools": ["exact-registered-tool-id"],
  "executor_recommendation": null,
  "context_recommendation": null,
  "is_ready_to_execute": false,
  "next_questions": [{"id":"stable-short-id","question":"One concrete question","options":["Choice A","Choice B"]}],
  "final_execution_prompt": "",
  "workflow_stages": [{"id":"draft","title":"First working draft","goal":"Create the smallest end-to-end version","deliverable":"A runnable first draft","verification":"Run it and check the main flow"}]
}

Use only supplied registered IDs. Use only directly relevant skills and tools; do not select every loosely related item. Ask up to three concise high-impact questions per turn, with options when helpful. With unresolved material choices, set is_ready_to_execute=false and ask. When ready, write an actionable, bounded plan and keep uncertainties in assumptions. For software requests, every stage needs a stable id, goal, deliverable, and observable verification; later stages remain pending until the user advances them. For non-software work, omit workflow_stages. Do not invent capabilities or completed work.`;

const EMPTY_STATE: LoopState = {
  status: "idle",
  originalPrompt: "",
  answers: [],
  result: null,
  error: null,
  turn: 0,
  skippedQuestions: false,
};

function makeTurnMessage(
  prompt: string,
  answers: AnswerRecord[],
  skills: SkillDefinition[],
  toolReferences: ReturnType<typeof architectToolReferences>,
  executorModel: string,
  architectContext: string,
  resources: ResourceSnapshot | null,
  images: ReferenceImage[],
  architectCanSeeImages: boolean,
  skip: boolean,
  priorResult: ArchitectResult | null,
  memoryContext: string,
): string {
  const answerText = answers.length
    ? answers.map(({ questionId, questionText, answer }) => `- ${questionText || questionId} [${questionId}]: ${answer}`).join("\n")
    : "No clarification answers yet.";
  let skillBudget = 6_000;
  const skillText = skills.slice(0, 32).map((skill) => {
    const content = skill.content.trim().slice(0, Math.min(500, skillBudget));
    skillBudget = Math.max(0, skillBudget - content.length);
    return `- ID: ${skill.id}\n  Name: ${skill.name}\n  Purpose: ${skill.description}\n  Triggers: ${skill.triggers.join(", ")}\n  Guidance excerpt: ${content || "No excerpt available."}`;
  }).join("\n") || "No skills are installed.";
  const toolText = toolReferences.length
    ? toolReferences.map((tool) => `- ID: ${tool.id}\n  Type: ${tool.kind}\n  Name: ${tool.name}\n  Location: ${tool.location}\n  Purpose: ${tool.description}\n  Triggers: ${tool.triggers.join(", ") || "none"}${tool.serverTriggers?.length ? `; server context: ${tool.serverTriggers.join(", ")}` : ""}\n  Usage: ${tool.usageNotes || "none"}`).join("\n")
    : "No applications or MCP calls are registered.";
  const imageText = images.length
    ? `${images.map((image, index) => `- [REF-${String(index + 1).padStart(2, "0")}] ${image.name} (${image.width}×${image.height}, ${image.mimeType})`).join("\n")}\n${architectCanSeeImages ? "These reference images are attached to this Architect request and may be inspected." : "The Architect cannot view these image pixels. Do not infer visual details from filenames or ask the user to repeat information visible only in them. Preserve these numbered references for the Executor and instruct it to inspect them before acting."}`
    : "No reference images supplied.";
  const skipInstruction = skip
    ? "The user selected Skip & Compile Now. Set is_ready_to_execute=true, use conservative reversible defaults for remaining unknowns, record them in known_specs under assumptions, and provide the complete final_execution_prompt."
    : "Continue the clarification loop. If any important decisions remain, ask focused questions. Otherwise compile the final prompt.";
  const priorSpecs = priorResult ? JSON.stringify({ known_specs: priorResult.known_specs, assumptions: priorResult.assumptions ?? [], detected_skills: priorResult.detected_skills, detected_tools: priorResult.detected_tools ?? [] }) : "No prior Architect analysis.";
  return `USER REQUEST\n${prompt}\n\nSAVED MEMORY CONTEXT\n${memoryContext || "No saved memory is being shared for this request."}\n\nCURRENT EXECUTOR MODEL AND CONTEXT\n${executorModel || "No Executor model selected."}\n\nCURRENT ARCHITECT CONTEXT\n${architectContext}\n\nCURRENT SYSTEM RESOURCES\n${resourceContext(resources)}\nUse this timestamped sample as advisory context for context length and model recommendations. Unavailable values are unknown; do not infer them.\n\nPRIOR ANALYSIS\n${priorSpecs}\n\nANSWERS ALREADY GIVEN — DO NOT ASK THESE AGAIN\n${answerText}\n\nAVAILABLE SKILLS AND THEIR GUIDANCE\n${skillText}\n\nREGISTERED APPLICATIONS AND MCP CALLS\n${toolText}\n\nREFERENCE IMAGES\n${imageText}\n\nEXECUTOR RECOMMENDATION RULE\nReturn null unless the current Executor is a poor fit for a material requirement such as vision, coding, or available memory. If needed, recommend only one of these available candidates: qwen3-vl:8b, qwen2.5-coder:7b. Choose the candidate that fills a capability gap. Never request a download or claim the model is installed; Lunaris will ask the user first.\n\nCURRENT TURN ${answers.length + 1} OF AT MOST ${MAX_CLARIFICATION_TURNS}\n${skipInstruction}`;
}

const QUESTION_STOP_WORDS = new Set("a an the and or but if then than of in on at to for from with by about into after before is are was were be been being do does did can could would should will may might what which who whom whose where when why how it its this that these those i we you they he she user please want need like prefer decide choose make use should".split(" "));

function questionTerms(question: string): string[] {
  const aliases: Record<string, string> = {
    look: "style", aesthetic: "style", aesthetics: "style", appearance: "style", visual: "style",
    cartoon: "style", cartoonish: "style", stylized: "style", stylised: "style", realistic: "style",
    realism: "style", photorealistic: "style", lowpoly: "style", "low-poly": "style", anime: "style",
    colour: "color", dimensions: "size", scale: "size",
  };
  return question.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .filter((term) => term.length > 2 && !QUESTION_STOP_WORDS.has(term))
    .map((term) => aliases[term] ?? term);
}

function isSameQuestion(question: string, prior: string): boolean {
  const currentTerms = questionTerms(question);
  const priorTerms = questionTerms(prior);
  if (!currentTerms.length || !priorTerms.length) return false;
  const currentKey = [...new Set(currentTerms)].sort().join(" ");
  const priorKey = [...new Set(priorTerms)].sort().join(" ");
  if (currentKey === priorKey) return true;
  const current = new Set(currentTerms);
  const previous = new Set(priorTerms);
  const overlap = [...current].filter((term) => previous.has(term)).length;
  const union = new Set([...current, ...previous]).size;
  const smaller = Math.min(current.size, previous.size);
  // Models often answer a broad question with a different wording of the same
  // decision (for example, “visual style?” → “cartoonish or realistic?”).
  // Treat a shared decision facet as equivalent even when the examples differ.
  if (current.has("style") && previous.has("style")) return true;
  return overlap >= 2 && overlap / smaller >= 0.8 && overlap / union >= 0.5;
}

function removeAnsweredQuestions(questions: QuestionCard[], answers: AnswerRecord[]): QuestionCard[] {
  const kept: QuestionCard[] = [];
  for (const question of questions) {
    const duplicate = answers.some((answer) => answer.questionId === question.id
      || (answer.questionText ? isSameQuestion(question.question, answer.questionText) : false))
      || kept.some((prior) => isSameQuestion(question.question, prior.question));
    if (!duplicate) kept.push(question);
  }
  return kept;
}

function rejectsImageInput(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:multimodal|image|vision).{0,100}(?:not support|unsupported|does not support|not available)|(?:not support|unsupported|does not support).{0,100}(?:multimodal|image|vision)/i.test(message);
}

export function useClarificationLoop() {
  const [state, setState] = useState<LoopState>(EMPTY_STATE);
  const activeRun = useRef(0);

  const evaluate = useCallback(async (args: {
    prompt: string;
    answers: AnswerRecord[];
    skills: SkillDefinition[];
    toolCatalog: ToolCatalog;
    executorModel: string;
    resources: ResourceSnapshot | null;
    images: ReferenceImage[];
    config: ProviderConfig;
    memoryContext: string;
    skip?: boolean;
    turn: number;
    priorResult?: ArchitectResult | null;
  }) => {
    const runId = ++activeRun.current;
    setState((current) => ({ ...current, status: args.skip ? "compiling" : "evaluating", error: null, turn: args.turn }));
    try {
      const architectHasVision = await architectCanSeeImages(args.config, args.images);
      const toolReferences = architectToolReferences(args.toolCatalog);
      const makeMessages = (canSeeImages: boolean) => [
        { role: "system" as const, content: `${SYSTEM_PROMPT}\n\nReturn context_recommendation as null unless the user asks about model/context setup or a different budget would materially help. If relevant, suggest separate Architect and Executor context token counts from 4096–131072 using task complexity, model sizes, and the timestamped resource sample; include a short rationale. The user must explicitly apply this suggestion.` },
        { role: "user" as const, content: makeTurnMessage(args.prompt, args.answers, args.skills, toolReferences, args.executorModel, `${args.config.contextMode ?? "auto"} · configured ${args.config.contextLength.toLocaleString()} tokens`, args.resources, args.images, canSeeImages, args.skip === true, args.priorResult ?? null, args.memoryContext) },
      ];
      const request = {
        role: "architect",
        config: args.config,
        temperature: 0.2,
      } as const;
      let result: ArchitectResult;
      try {
        result = await evaluateArchitect({ ...request, images: architectHasVision ? args.images : [], messages: makeMessages(architectHasVision) });
      } catch (error) {
        if (!architectHasVision || args.images.length === 0 || !rejectsImageInput(error)) throw error;
        result = await evaluateArchitect({ ...request, images: [], messages: makeMessages(false) });
      }
      result = { ...result, next_questions: removeAnsweredQuestions(result.next_questions, args.answers) };
      if (runId !== activeRun.current) return result;
      if (args.skip || (!result.is_ready_to_execute && result.next_questions.length === 0) || args.turn >= MAX_CLARIFICATION_TURNS) {
        setState((current) => ({ ...current, status: "ready", result: { ...result, is_ready_to_execute: true, next_questions: [] }, error: null, skippedQuestions: args.skip === true }));
      } else if (result.is_ready_to_execute) {
        setState((current) => ({ ...current, status: "ready", result, error: null, skippedQuestions: false }));
      } else {
        setState((current) => ({ ...current, status: "questioning", result, error: null }));
      }
      return result;
    } catch (caught) {
      if (runId === activeRun.current) {
        setState((current) => ({ ...current, status: "error", error: caught instanceof Error ? caught.message : String(caught) }));
      }
      return null;
    }
  }, []);

  const start = useCallback(async (
    prompt: string,
    images: ReferenceImage[],
    config: ProviderConfig,
    skills: SkillDefinition[],
    toolCatalog: ToolCatalog,
    executorModel: string,
    resources: ResourceSnapshot | null,
    memoryContext: string,
  ) => {
    const cleaned = prompt.trim();
    if (!cleaned) return;
    setState({ ...EMPTY_STATE, status: "evaluating", originalPrompt: cleaned });
    await evaluate({ prompt: cleaned, answers: [], skills, toolCatalog, executorModel, resources, images, config, turn: 1, memoryContext });
  }, [evaluate]);

  const answer = useCallback(async (
    questionId: string,
    answerText: string,
    config: ProviderConfig,
    skills: SkillDefinition[],
    toolCatalog: ToolCatalog,
    images: ReferenceImage[],
    executorModel: string,
    resources: ResourceSnapshot | null,
    memoryContext: string,
  ) => {
    const cleaned = answerText.trim();
    if (!cleaned || !state.originalPrompt) return;
    const questionText = state.result?.next_questions.find((question) => question.id === questionId)?.question;
    const answers = [...state.answers.filter((item) => item.questionId !== questionId), { questionId, ...(questionText ? { questionText } : {}), answer: cleaned }];
    setState((current) => ({ ...current, status: "evaluating", answers, error: null }));
    await evaluate({ prompt: state.originalPrompt, answers, skills, toolCatalog, executorModel, resources, images, config, turn: state.turn + 1, priorResult: state.result, memoryContext });
  }, [evaluate, state.answers, state.originalPrompt, state.result, state.turn]);

  const retry = useCallback(async (config: ProviderConfig, skills: SkillDefinition[], toolCatalog: ToolCatalog, images: ReferenceImage[], executorModel: string, resources: ResourceSnapshot | null, memoryContext: string) => {
    if (!state.originalPrompt) return;
    await evaluate({ prompt: state.originalPrompt, answers: state.answers, skills, toolCatalog, executorModel, resources, images, config, turn: Math.max(1, state.turn), priorResult: state.result, memoryContext });
  }, [evaluate, state.answers, state.originalPrompt, state.result, state.turn]);

  const skipAndCompile = useCallback(async (config: ProviderConfig, skills: SkillDefinition[], toolCatalog: ToolCatalog, images: ReferenceImage[], executorModel: string, resources: ResourceSnapshot | null, memoryContext: string) => {
    if (!state.originalPrompt) return;
    const result = await evaluate({
      prompt: state.originalPrompt,
      answers: state.answers,
      skills,
      toolCatalog,
      executorModel,
      resources,
      images,
      config,
      skip: true,
      turn: state.turn + 1,
      priorResult: state.result,
      memoryContext,
    });
    if (!result && activeRun.current > 0) {
      setState((current) => ({
        ...current,
        status: "ready",
        skippedQuestions: true,
        result: current.result ? { ...current.result, is_ready_to_execute: true, next_questions: [] } : {
          known_specs: {}, detected_skills: [], is_ready_to_execute: true, next_questions: [], final_execution_prompt: "Use the rough request and recorded answers to produce a clear step-by-step execution plan. State reasonable assumptions before acting.",
        },
        error: null,
      }));
    }
  }, [evaluate, state.answers, state.originalPrompt, state.turn, state.result]);

  const restore = useCallback((session: PromptSession) => {
    activeRun.current += 1;
    setState({
      status: session.result ? "ready" : "idle",
      originalPrompt: session.prompt,
      answers: session.answers ?? [],
      result: session.result,
      error: null,
      turn: session.answerCount + 1,
      skippedQuestions: session.skippedQuestions ?? false,
    });
  }, []);

  const reset = useCallback(() => {
    activeRun.current += 1;
    setState(EMPTY_STATE);
  }, []);

  return { state, start, answer, retry, skipAndCompile, restore, reset };
}
