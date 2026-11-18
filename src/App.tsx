import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { Archive, ArrowUpRight, Bookmark, Check, CheckCircle2, Clock3, Command, FileJson, FileText, Moon, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Titlebar } from "./components/layout/Titlebar";
import { CelestialBackground } from "./components/layout/CelestialBackground";
import { Sidebar, type NavigationPage } from "./components/layout/Sidebar";
import { PromptInput } from "./components/forge/PromptInput";
import { ClarificationLoop } from "./components/forge/ClarificationLoop";
import { BlueprintViewer } from "./components/forge/BlueprintViewer";
import { ProviderSettings } from "./components/modals/ProviderSettings";
import { SkillManager } from "./components/modals/SkillManager";
import { ToolLibrary } from "./components/modals/ToolLibrary";
import { MemoryManager } from "./components/memory/MemoryManager";
import { ModelCenter } from "./components/models/ModelCenter";
import { ModelChangeRequest, type ExecutorRecommendation } from "./components/models/ModelChangeRequest";
import { DesignStudio } from "./components/studio/DesignStudio";
import { BackupManager } from "./components/modals/BackupManager";
import { useSystemResources } from "./hooks/useSystemResources";
import { MODEL_CATALOG, modelCapabilities } from "./data/modelCatalog";
import { resourceContext } from "./lib/resourceContext";
import { useClarificationLoop } from "./hooks/useClarificationLoop";
import { cancelStream, streamText } from "./lib/llmRouter";
import { compileExecutionPrompt, compileWorkflowStagePrompt } from "./lib/promptCompiler";
import { motionTransitions } from "./lib/motion";
import { loadHistory, loadMemory, loadSettings, loadSkills, saveHistory, saveMemory, saveSettings, type LunarisSettings } from "./lib/storage";
import { hasMemory, memoryContext } from "./lib/memory";
import { mergeBackup } from "./lib/backup";
import { makeBlueprintRevision, stagesForRequest } from "./lib/workflow";
import type { AnswerRecord, BlueprintRevision, ExecutorTurn, PromptSession, ReferenceImage, WorkflowStage, WorkflowStageProgress } from "./types/architect";
import { EMPTY_MEMORY, MEMORY_LIMITS, type MemoryCollection, type MemoryEntry, type MemoryScope } from "./types/memory";
import { DEFAULT_PROVIDER_SETTINGS } from "./types/provider";
import type { ProviderSettings as ProviderSettingsType } from "./types/provider";
import type { SkillDefinition } from "./types/skills";
import type { ToolCatalog } from "./types/tools";
import type { BackupBundle } from "./types/backup";

const INITIAL_SETTINGS: LunarisSettings = {
  providers: DEFAULT_PROVIDER_SETTINGS,
  selectedNavigation: "forge",
  toolCatalog: { applications: [], mcpServers: [] },
  theme: "lunar",
  monitorResources: true,
  modelPreference: "balanced",
  backgroundScene: "moonlit",
  backgroundIntensity: 70,
  backgroundMotion: "system",
  customPromptTemplates: [],
};

interface ChecklistStep { id: string; label: string }

function extractChecklist(text: string): ChecklistStep[] {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#{1,4}\s*(execution plan|implementation plan|steps|action plan)/i.test(line.trim()));
  const source = headingIndex >= 0 ? lines.slice(headingIndex + 1) : lines;
  const candidates = source.map((line) => line.trim()).filter((line) => /^(?:\d{1,2}[.)]\s+|[-*]\s+\[[ x]\]\s+)/.test(line));
  const extracted = candidates.slice(0, 16).map((line, index) => {
    const label = line.replace(/^(?:\d{1,2}[.)]\s+|[-*]\s+\[[ x]\]\s+)/, "").replace(/\*\*/g, "").trim();
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    return { id: `step-${index}-${slug || "task"}`, label };
  }).filter((step) => step.label.length > 0);
  return extracted.length ? extracted : [{ id: "review-blueprint", label: "Review the blueprint and begin with the first action" }];
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 72) || "lunaris-blueprint";
}

function exportSession(session: PromptSession, format: "md" | "json") {
  const payload = {
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    prompt: session.prompt,
    knownSpecs: session.result?.known_specs ?? {},
    answers: session.answers,
    detectedSkills: session.result?.detected_skills ?? [],
    detectedTools: session.result?.detected_tools ?? [],
    compiledPrompt: session.compiledPrompt,
    completedChecklistSteps: session.completedChecklistSteps ?? [],
    projectId: session.projectId ?? null,
    includeMemory: session.includeMemory ?? false,
  };
  const content = format === "json"
    ? JSON.stringify(payload, null, 2)
    : `# ${payload.title}\n\nCreated: ${payload.createdAt}\nUpdated: ${payload.updatedAt}\n\n## Original request\n\n${payload.prompt}\n\n## Known specifications\n\n\`\`\`json\n${JSON.stringify(payload.knownSpecs, null, 2)}\n\`\`\`\n\n## Clarifications\n\n${payload.answers.length ? payload.answers.map((answer) => `- **${answer.questionText || answer.questionId}:** ${answer.answer}`).join("\n") : "No clarification answers."}\n\n## Included skills and tools\n\n- Skills: ${payload.detectedSkills.join(", ") || "None"}\n- Tools: ${payload.detectedTools.join(", ") || "None"}\n\n## Compiled blueprint\n\n${payload.compiledPrompt}\n`;
  const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(session.title)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Something went wrong.";
}

function shortTitle(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim())?.trim() || "Untitled prompt";
  return firstLine.length > 56 ? `${firstLine.slice(0, 53)}…` : firstLine;
}

function effectiveContext(
  config: ProviderSettingsType["architect"],
  role: "architect" | "executor",
  resources: import("./types/provider").ResourceSnapshot | null,
  requestText: string,
  imageCount: number,
) {
  if (config.contextMode !== "auto" || config.provider === "llamacpp") return config;
  const availableGpu = resources?.vramTotalBytes
    ? Math.max(0, resources.vramTotalBytes - (resources.vramUsedBytes ?? 0)) / 1024 ** 3
    : null;
  const availableRam = resources?.ramTotalBytes
    ? Math.max(0, resources.ramTotalBytes - (resources.ramUsedBytes ?? 0)) / 1024 ** 3
    : null;
  const budget = availableGpu ?? availableRam;
  const complexRequest = requestText.length > 2800 || imageCount > 1;
  let contextLength = role === "architect"
    ? budget !== null && budget < 2.5 ? 4096 : 8192
    : budget === null ? 8192 : budget < 2.5 ? 4096 : budget < 5 ? 8192 : budget < 9 ? 16384 : 32768;
  if (role === "executor" && complexRequest) contextLength = Math.min(65536, contextLength * 2);
  const parameterSize = Number(/(\d+(?:\.\d+)?)\s*b/i.exec(config.model)?.[1] ?? 0);
  if (role === "executor" && parameterSize >= 20 && contextLength > 16384) contextLength = 16384;
  return { ...config, contextLength };
}

function executorContextSummary(
  config: ProviderSettingsType["executor"],
  resources: import("./types/provider").ResourceSnapshot | null,
  requestText: string,
  imageCount: number,
): string {
  const resolved = effectiveContext(config, "executor", resources, requestText, imageCount);
  return `${config.model || "No Executor model selected"} · ${config.contextMode ?? "auto"} context · ${resolved.contextLength.toLocaleString()} tokens effective`;
}

export default function App() {
  const [page, setPage] = useState<NavigationPage>("forge");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<LunarisSettings>(INITIAL_SETTINGS);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [memory, setMemory] = useState<MemoryCollection>(EMPTY_MEMORY);
  const [memoryLoadedSuccessfully, setMemoryLoadedSuccessfully] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [includeMemory, setIncludeMemory] = useState(true);
  const [history, setHistory] = useState<PromptSession[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"active" | "archived">("active");
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [stagedHandoffPaths, setStagedHandoffPaths] = useState<string[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [executorText, setExecutorText] = useState("");
  const [executorConversation, setExecutorConversation] = useState<ExecutorTurn[]>([]);
  const [executorChatDraft, setExecutorChatDraft] = useState("");
  const [activeStudioStageId, setActiveStudioStageId] = useState<string | null>(null);
  const [blueprintDraft, setBlueprintDraft] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [modelRequest, setModelRequest] = useState<ExecutorRecommendation | null>(null);
  const sessionId = useRef<string | null>(null);
  const requestMemoryContext = useRef("");
  const memoryWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const persistedMemory = useRef<MemoryCollection>(EMPTY_MEMORY);
  const includeMemoryOverride = useRef(false);
  const restoredSession = useRef(false);
  const activeStreamId = useRef<string | null>(null);
  const dismissedModelRequests = useRef(new Set<string>());
  const updateCheckStarted = useRef(false);
  const stopRequested = useRef(false);
  const loop = useClarificationLoop();
  const resources = useSystemResources(settings.monitorResources);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!initialized || updateCheckStarted.current) return;
    updateCheckStarted.current = true;
    void checkForUpdate().then(async (update) => {
      if (!update) return;
      const accepted = window.confirm(`Lunaris ${update.version} is available. Download and install it now?`);
      if (!accepted) return;
      setNotice(`Downloading Lunaris ${update.version}…`);
      await update.downloadAndInstall();
      setNotice(`Lunaris ${update.version} is ready. Restart the app to finish updating.`);
    }).catch((error: unknown) => {
      console.warn("Lunaris update check failed", error);
    });
  }, [initialized]);

  useEffect(() => {
    if (restoredSession.current || loop.state.status !== "ready" || !loop.state.result?.executor_recommendation) return;
    const recommendation = loop.state.result.executor_recommendation;
    const allowed = MODEL_CATALOG.find((model) => model.model === recommendation.model && model.role === "Executor");
    if (!allowed || recommendation.model === settings.providers.executor.model) return;
    const replaceableModelMemory = settings.providers.executor.provider === "ollama"
      ? MODEL_CATALOG.find((model) => model.model === settings.providers.executor.model)?.estimatedVramGb ?? 0
      : 0;
    const availableVram = resources.snapshot?.vramTotalBytes
      ? resources.snapshot.vramTotalBytes - (resources.snapshot.vramUsedBytes ?? 0) + replaceableModelMemory * 1024 ** 3
      : null;
    if (availableVram !== null && allowed.estimatedVramGb * 1024 ** 3 > availableVram * 1.2) return;
    const key = `${sessionId.current ?? loop.state.originalPrompt}:${recommendation.model}`;
    if (dismissedModelRequests.current.has(key)) return;
    setModelRequest({ ...recommendation, capabilities: recommendation.capabilities.length ? recommendation.capabilities : modelCapabilities(recommendation.model) });
  }, [loop.state.status, loop.state.result, loop.state.originalPrompt, settings.providers.executor.model, resources.snapshot]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([loadSettings(), loadHistory(), loadSkills(), loadMemory()]).then(async ([savedSettings, savedHistory, savedSkills, savedMemory]) => {
      if (!active) return;
      if (savedSettings.status === "fulfilled") {
        setSettings(savedSettings.value);
        try {
          await invoke("set_global_shortcut", { shortcut: savedSettings.value.providers.globalShortcut });
        } catch (error) {
          if (active) setNotice(`Global shortcut: ${errorText(error)}`);
        }
      } else {
        setNotice(`Settings could not be loaded: ${errorText(savedSettings.reason)}`);
      }
      if (savedHistory.status === "fulfilled") setHistory(savedHistory.value.sessions);
      else setNotice(`History could not be loaded: ${errorText(savedHistory.reason)}`);
      if (savedSkills.status === "fulfilled") setSkills(savedSkills.value);
      else setNotice(`Skill library could not be loaded: ${errorText(savedSkills.reason)}`);
      if (savedMemory.status === "fulfilled") {
        persistedMemory.current = savedMemory.value;
        setMemory(savedMemory.value);
        setMemoryLoadedSuccessfully(true);
        setIncludeMemory(savedMemory.value.enabledByDefault);
      } else setNotice(`Permanent memory could not be loaded: ${errorText(savedMemory.reason)}`);
      setInitialized(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const timeout = window.setTimeout(() => {
      void saveHistory({ sessions: history }).catch((error) => setNotice(`History could not be saved: ${errorText(error)}`));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [history, initialized]);

  useEffect(() => {
    const id = sessionId.current;
    if (!id || !executorConversation.length) return;
    setHistory((current) => current.map((session) => session.id === id ? { ...session, executorConversation, updatedAt: new Date().toISOString() } : session));
  }, [executorConversation]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const referenceLines = images.map((image, index) => {
    const label = `[REF-${String(index + 1).padStart(2, "0")}] ${image.name} (${image.width}×${image.height})`;
    return stagedHandoffPaths?.[index] ? `${label} — local file: "${stagedHandoffPaths[index]}"` : `${label} — Executor image ${index + 1}`;
  });

  const compiled = useMemo(() => {
    if (loop.state.status !== "ready" || !loop.state.result) return null;
    return compileExecutionPrompt({
      originalPrompt: loop.state.originalPrompt,
      result: loop.state.result,
      answers: loop.state.answers,
      skills,
      skippedQuestions: loop.state.skippedQuestions,
      attachments: referenceLines,
      toolCatalog: settings.toolCatalog,
      memoryContext: requestMemoryContext.current,
    });
  }, [loop.state.status, loop.state.result, loop.state.originalPrompt, loop.state.answers, loop.state.skippedQuestions, skills, referenceLines.join("\n"), settings.toolCatalog]);

  const workflowStages = useMemo(() => loop.state.status === "ready" && loop.state.result
    ? stagesForRequest(loop.state.originalPrompt, loop.state.result.workflow_stages)
    : [], [loop.state.status, loop.state.result, loop.state.originalPrompt]);

  const activeMemoryContext = requestMemoryContext.current;

  const displayedCompiled = useMemo(() => {
    if (!compiled) return compiled;
    if (blueprintDraft !== null) return { ...compiled, text: blueprintDraft };
    if (!restoredSession.current) return compiled;
    const saved = history.find((session) => session.id === sessionId.current);
    return saved?.compiledPrompt ? { ...compiled, text: saved.compiledPrompt } : compiled;
  }, [compiled, history, blueprintDraft]);

  useEffect(() => {
    if (!compiled || restoredSession.current || !loop.state.result) return;
    const id = sessionId.current ?? crypto.randomUUID();
    sessionId.current = id;
    const now = new Date().toISOString();
    setHistory((current) => {
      const prior = current.find((session) => session.id === id);
      const session: PromptSession = {
        id,
        title: shortTitle(loop.state.originalPrompt),
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
        prompt: loop.state.originalPrompt,
        result: loop.state.result,
        answers: loop.state.answers,
        compiledPrompt: compiled.text,
        answerCount: loop.state.answers.length,
        skippedQuestions: loop.state.skippedQuestions,
        pinned: prior?.pinned,
        archived: prior?.archived,
        completedChecklistSteps: prior?.completedChecklistSteps ?? [],
        projectId: selectedProjectId,
        includeMemory,
        workflowStages,
        stageProgress: prior?.stageProgress ?? workflowStages.map((stage) => ({ stageId: stage.id, status: "pending" as const, evidence: "", updatedAt: now })),
        executorConversation: prior?.executorConversation ?? [],
        blueprintRevisions: prior?.blueprintRevisions ?? [],
      };
      return [session, ...current.filter((item) => item.id !== id)].slice(0, 250);
    });
  }, [compiled, loop.state.originalPrompt, loop.state.result, loop.state.answers, loop.state.skippedQuestions, selectedProjectId, includeMemory, workflowStages]);

  const startPrompt = (prompt: string, attachments: ReferenceImage[], projectId: string | null, useMemory: boolean) => {
    setModelRequest(null);
    sessionId.current = crypto.randomUUID();
    restoredSession.current = false;
    setImages(attachments);
    setSelectedProjectId(projectId);
    setIncludeMemory(useMemory);
    includeMemoryOverride.current = true;
    requestMemoryContext.current = memoryContext(memory, projectId, useMemory);
    setStagedHandoffPaths(null);
    setExecutorText("");
    setExecutorConversation([]);
    setExecutorChatDraft("");
    setActiveStudioStageId(null);
    setBlueprintDraft(null);
    setStreamError(null);
    setPage("forge");
    void loop.start(prompt, attachments, effectiveContext(settings.providers.architect, "architect", resources.snapshot, prompt, attachments.length), skills, settings.toolCatalog, executorContextSummary(settings.providers.executor, resources.snapshot, prompt, attachments.length), resources.snapshot, requestMemoryContext.current);
  };

  const newPrompt = () => {
    setModelRequest(null);
    if (activeStreamId.current) void cancelStream(activeStreamId.current);
    sessionId.current = null;
    requestMemoryContext.current = "";
    restoredSession.current = false;
    activeStreamId.current = null;
    stopRequested.current = false;
    setImages([]);
    setSelectedProjectId(null);
    setIncludeMemory(memory.enabledByDefault);
    includeMemoryOverride.current = false;
    setStagedHandoffPaths(null);
    setExecutorText("");
    setExecutorConversation([]);
    setExecutorChatDraft("");
    setActiveStudioStageId(null);
    setBlueprintDraft(null);
    setStreamError(null);
    loop.reset();
    setPage("forge");
  };

  const openSession = (session: PromptSession) => {
    setModelRequest(null);
    if (activeStreamId.current) void cancelStream(activeStreamId.current);
    sessionId.current = session.id;
    restoredSession.current = true;
    requestMemoryContext.current = "";
    setImages([]);
    setSelectedProjectId(session.projectId && memory.projects.some((project) => project.id === session.projectId) ? session.projectId : null);
    setIncludeMemory(session.includeMemory ?? memory.enabledByDefault);
    includeMemoryOverride.current = true;
    setStagedHandoffPaths(null);
    setExecutorText("");
    setExecutorConversation(session.executorConversation ?? []);
    setExecutorChatDraft("");
    setActiveStudioStageId(session.workflowStages?.find((stage) => (session.stageProgress ?? []).find((progress) => progress.stageId === stage.id)?.status !== "verified")?.id ?? session.workflowStages?.[0]?.id ?? null);
    setBlueprintDraft(null);
    setStreamError(null);
    loop.restore(session);
    setPage("forge");
  };

  const saveProviderSettings = async (providers: ProviderSettingsType, appearance: Pick<LunarisSettings, "theme" | "monitorResources" | "backgroundScene" | "backgroundIntensity" | "backgroundMotion">) => {
    const next: LunarisSettings = { ...settings, providers, ...appearance };
    await saveSettings(next);
    setSettings(next);
    setSettingsOpen(false);
    setNotice("Provider settings saved.");
  };

  const saveToolCatalog = async (toolCatalog: ToolCatalog) => {
    const next: LunarisSettings = { ...settings, toolCatalog };
    await saveSettings(next);
    setSettings(next);
  };

  const saveModelSettings = (patch: Partial<Pick<LunarisSettings, "providers" | "modelPreference">>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(next).catch((error) => setNotice(`Settings could not be saved: ${errorText(error)}`));
  };

  const saveCustomTemplates = (customPromptTemplates: LunarisSettings["customPromptTemplates"]) => {
    const next = { ...settings, customPromptTemplates };
    setSettings(next);
    void saveSettings(next).catch((error) => setNotice(`Custom templates could not be saved: ${errorText(error)}`));
  };

  const acceptModelRequest = (model: string, runtime: "ollama" | "custom", baseUrl: string) => {
    const updated = {
      ...settings.providers,
      executor: {
        ...settings.providers.executor,
        provider: runtime,
        baseUrl,
        model,
        visionEnabled: modelCapabilities(model).includes("vision"),
      },
    };
    saveModelSettings({ providers: updated });
    setModelRequest(null);
    setNotice(`Executor switched to ${model}.`);
  };

  const dismissModelRequest = () => {
    const model = modelRequest?.model;
    if (model) dismissedModelRequests.current.add(`${sessionId.current ?? loop.state.originalPrompt}:${model}`);
    setModelRequest(null);
  };

  const updateMemory = async (next: MemoryCollection, savedNotice = "Permanent memory saved.") => {
    if (!memoryLoadedSuccessfully) {
      setNotice("Memory storage could not be loaded safely, so changes were not saved.");
      return;
    }
    setMemory(next);
    if (selectedProjectId && !next.projects.some((project) => project.id === selectedProjectId)) setSelectedProjectId(null);
    const write = memoryWriteQueue.current.catch(() => undefined).then(() => saveMemory(next));
    memoryWriteQueue.current = write;
    try {
      await write;
      persistedMemory.current = next;
      setNotice(savedNotice);
    } catch (error) {
      setMemory((current) => current === next ? persistedMemory.current : current);
      setNotice(`Permanent memory could not be saved: ${errorText(error)}`);
    }
  };

  const updateMemoryDefault = (enabled: boolean) => {
    if (!includeMemoryOverride.current && loop.state.status === "idle") setIncludeMemory(enabled);
    void updateMemory({ ...memory, enabledByDefault: enabled });
  };

  const saveAnswerMemory = (answer: AnswerRecord, scope: MemoryScope) => {
    const projectId = scope === "project" ? selectedProjectId : null;
    const title = (answer.questionText || "Clarification answer").trim().slice(0, MEMORY_LIMITS.titleCharacters);
    const content = answer.answer.trim().slice(0, MEMORY_LIMITS.entryCharacters);
    if (!content || (scope === "project" && !projectId)) return;
    if (hasMemory(memory, title, content, scope, projectId)) {
      setNotice("That fact is already saved in memory.");
      return;
    }
    if (memory.entries.length >= MEMORY_LIMITS.entries) {
      setNotice(`Memory is full (${MEMORY_LIMITS.entries} entries). Delete an old fact before saving another.`);
      return;
    }
    const now = new Date().toISOString();
    const entry: MemoryEntry = { id: crypto.randomUUID(), title, content, scope, projectId, enabled: true, source: "approved-answer", createdAt: now, updatedAt: now };
    void updateMemory({ ...memory, entries: [entry, ...memory.entries] }, `Saved to ${scope === "profile" ? "Profile" : memory.projects.find((project) => project.id === projectId)?.name ?? "Project"} memory.`);
  };

  const toggleSessionFlag = (id: string, field: "pinned" | "archived") => {
    setHistory((current) => current.map((session) => session.id === id ? { ...session, [field]: !session[field] } : session));
  };

  const removeSession = (session: PromptSession) => {
    if (!window.confirm(`Delete “${session.title}” from prompt history? This cannot be undone.`)) return;
    setHistory((current) => current.filter((item) => item.id !== session.id));
    if (sessionId.current === session.id) newPrompt();
  };

  const currentSessionForExport = (): PromptSession | null => {
    if (!displayedCompiled || !loop.state.result) return null;
    const existing = history.find((session) => session.id === sessionId.current);
    return existing ?? {
      id: sessionId.current ?? crypto.randomUUID(), title: shortTitle(loop.state.originalPrompt), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      prompt: loop.state.originalPrompt, result: loop.state.result, answers: loop.state.answers, compiledPrompt: displayedCompiled.text,
      answerCount: loop.state.answers.length, skippedQuestions: loop.state.skippedQuestions,
    };
  };

  const checklist = useMemo(() => displayedCompiled ? extractChecklist(displayedCompiled.text) : [], [displayedCompiled?.text]);
  const completedChecklistSteps = history.find((session) => session.id === sessionId.current)?.completedChecklistSteps ?? [];
  const activeSession = history.find((session) => session.id === sessionId.current) ?? currentSessionForExport();
  const activeWorkflowStages = activeSession?.workflowStages?.length ? activeSession.workflowStages : workflowStages;
  const activeStageProgress = activeSession?.stageProgress ?? activeWorkflowStages.map((stage) => ({ stageId: stage.id, status: "pending" as const, evidence: "", updatedAt: "" }));
  const activeStudioStage = activeWorkflowStages.find((stage) => stage.id === activeStudioStageId) ?? activeWorkflowStages.find((stage) => !activeStageProgress.some((item) => item.stageId === stage.id && item.status === "verified")) ?? activeWorkflowStages[0];
  const toggleChecklistStep = (stepId: string) => {
    const id = sessionId.current;
    if (!id) return;
    setHistory((current) => current.map((session) => {
      if (session.id !== id) return session;
      const completed = new Set(session.completedChecklistSteps ?? []);
      if (completed.has(stepId)) completed.delete(stepId); else completed.add(stepId);
      return { ...session, completedChecklistSteps: [...completed] };
    }));
  };
  const clearChecklist = () => {
    const id = sessionId.current;
    if (id) setHistory((current) => current.map((session) => session.id === id ? { ...session, completedChecklistSteps: [] } : session));
  };

  const saveCurrentSession = (patch: Partial<PromptSession>) => {
    const id = sessionId.current;
    if (!id) return;
    const updatedAt = new Date().toISOString();
    setHistory((current) => current.map((session) => session.id === id ? { ...session, ...patch, updatedAt } : session));
  };

  const setStageProgress = (stageId: string, status: WorkflowStageProgress["status"], evidence: string) => {
    const current = activeStageProgress.filter((item) => item.stageId !== stageId);
    saveCurrentSession({ stageProgress: [...current, { stageId, status, evidence: evidence.slice(0, 4000), updatedAt: new Date().toISOString() }] });
  };

  const saveBlueprintRevision = (text: string, reason: string) => {
    const session = currentSessionForExport();
    const id = sessionId.current;
    if (!session || !id || !displayedCompiled || text === displayedCompiled.text) return;
    const snapshot = makeBlueprintRevision({ ...session, compiledPrompt: displayedCompiled.text, workflowStages: activeWorkflowStages }, displayedCompiled.text, reason);
    const revisions = [...(session.blueprintRevisions ?? []), snapshot].slice(-20);
    setHistory((current) => current.map((item) => item.id === id ? { ...item, compiledPrompt: text, blueprintRevisions: revisions, updatedAt: new Date().toISOString() } : item));
    restoredSession.current = true;
    setBlueprintDraft(text);
    setNotice("Blueprint revision saved. The prior version is available below.");
  };

  const restoreBlueprintRevision = (revision: BlueprintRevision) => {
    const session = currentSessionForExport();
    const id = sessionId.current;
    if (!session || !id || !window.confirm(`Restore “${revision.reason}” as the current blueprint? The current version will be saved first.`)) return;
    const currentSnapshot = makeBlueprintRevision({ ...session, compiledPrompt: displayedCompiled?.text ?? session.compiledPrompt, workflowStages: activeWorkflowStages }, displayedCompiled?.text ?? session.compiledPrompt, "Before restoring " + revision.reason);
    const revisions = [...(session.blueprintRevisions ?? []), currentSnapshot].slice(-20);
    const nextResult = revision.result ?? session.result;
    const nextStages = revision.stages.length ? revision.stages : session.workflowStages ?? workflowStages;
    const nextSession = { ...session, result: nextResult, compiledPrompt: revision.text, workflowStages: nextStages, blueprintRevisions: revisions, updatedAt: new Date().toISOString() };
    setHistory((current) => current.map((item) => item.id === id ? nextSession : item));
    restoredSession.current = true;
    setBlueprintDraft(null);
    setActiveStudioStageId(nextStages.find((stage) => !activeStageProgress.some((item) => item.stageId === stage.id && item.status === "verified"))?.id ?? nextStages[0]?.id ?? null);
    loop.restore(nextSession);
    setNotice("Blueprint revision restored; the previous version was saved to history.");
  };

  const importBackup = async (backup: BackupBundle) => {
    if (!memoryLoadedSuccessfully) throw new Error("Permanent memory could not be loaded safely. Resolve that storage issue before restoring a backup.");
    const currentSkills = await invoke<import("./types/skills").SkillFile[]>("skills_list").then(async (ids) => Promise.all(ids.map((id) => invoke<import("./types/skills").SkillFile | null>("skills_read", { id })))).then((files) => files.filter((file): file is import("./types/skills").SkillFile => file !== null));
    const merged = mergeBackup({ settings, history: { sessions: history }, memory, skills: currentSkills }, backup);
    await invoke("backup_restore", { backup: merged });
    setSettings(merged.settings);
    document.documentElement.dataset.theme = merged.settings.theme;
    setHistory(merged.history.sessions);
    setMemory(merged.memory);
    persistedMemory.current = merged.memory;
    setMemoryLoadedSuccessfully(true);
    try { setSkills(await loadSkills()); } catch { setNotice("Backup was restored, but Lunaris could not refresh the skill list. Reopen Skill Library to retry."); }
    setPage("forge");
  };

  const copyPrompt = async () => {
    if (!displayedCompiled) return;
    try {
      let paths = stagedHandoffPaths;
      if (images.length > 0 && !paths) {
        const handoffId = sessionId.current ?? crypto.randomUUID();
        paths = [];
        for (const [index, image] of images.entries()) {
          const staged = await invoke<{ name: string; path: string }>("stage_handoff_image", {
            handoffId,
            index: index + 1,
            name: image.name,
            mimeType: image.mimeType,
            base64Data: image.base64,
          });
          paths.push(staged.path);
        }
        setStagedHandoffPaths(paths);
      }
      const attachments = images.map((image, index) => {
        const label = `[REF-${String(index + 1).padStart(2, "0")}] ${image.name} (${image.width}×${image.height})`;
        return paths?.[index] ? `${label} — local file: "${paths[index]}"` : `${label} — Executor image ${index + 1}`;
      });
      const promptToCopy = images.length > 0 && loop.state.result
        ? compileExecutionPrompt({
          originalPrompt: loop.state.originalPrompt,
          result: loop.state.result,
          answers: loop.state.answers,
          skills,
          skippedQuestions: loop.state.skippedQuestions,
          attachments,
          toolCatalog: settings.toolCatalog,
          memoryContext: requestMemoryContext.current,
        }).text
        : displayedCompiled.text;
      await invoke("clipboard_write_text", { text: promptToCopy });
      setNotice(images.length > 0
        ? `Blueprint copied with ${images.length} numbered image reference${images.length === 1 ? "" : "s"} and temporary image files.`
        : "Blueprint copied to clipboard.");
    } catch (error) {
      setNotice(`Could not prepare the IDE handoff: ${errorText(error)}`);
    }
  };

  const copyReviewPrompt = async (text: string) => {
    try {
      await invoke("clipboard_write_text", { text });
      setNotice("Blueprint review prompt copied. Paste it into the Executor when you want a second-pass review.");
    } catch (error) {
      setNotice(`Could not copy the review prompt: ${errorText(error)}`);
    }
  };

  const requestStop = async (requestId: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        if (await cancelStream(requestId)) return;
      } catch {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  };

  const stopStream = () => {
    stopRequested.current = true;
    if (activeStreamId.current) void requestStop(activeStreamId.current);
  };

  const startStream = async (stage?: WorkflowStage, followUp?: string) => {
    if (!displayedCompiled || streaming) return;
    if (!settings.providers.executor.model.trim()) {
      setStreamError("Choose an Executor model in Provider Settings first.");
      return;
    }
    setStreaming(true);
    setStreamError(null);
    setExecutorText("");
    setExecutorChatDraft("");
    stopRequested.current = false;
    activeStreamId.current = null;
    try {
      const stagePrompt = stage ? compileWorkflowStagePrompt(displayedCompiled, stage, activeStageProgress) : displayedCompiled.text;
      const priorTurns = executorConversation.slice(-30);
      const messages = [
        { role: "system" as const, content: `You are the configured Execution AI. Respect the blueprint and the user's current-stage boundary. Do not claim checks you did not run. For a stage, stop after that stage and provide precise test evidence or manual test instructions.\n\nCURRENT COMPUTER RESOURCES (timestamped advisory snapshot)\n${resourceContext(resources.snapshot)}` },
        { role: "user" as const, content: stagePrompt },
        ...priorTurns.map((turn) => ({ role: turn.role, content: turn.content })),
        ...(followUp ? [{ role: "user" as const, content: followUp }] : []),
      ];
      const response = await streamText({
        role: "executor",
        config: images.length > 0
          ? { ...effectiveContext(settings.providers.executor, "executor", resources.snapshot, displayedCompiled.text, images.length), visionEnabled: true }
          : effectiveContext(settings.providers.executor, "executor", resources.snapshot, displayedCompiled.text, images.length),
        images,
        maxTokens: 4096,
        messages,
      }, (delta) => {
        setExecutorText((current) => current + delta);
        setExecutorChatDraft((current) => current + delta);
      }, (id) => {
        activeStreamId.current = id;
        if (stopRequested.current) void requestStop(id);
      });
      if (stage || followUp) {
        const now = new Date().toISOString();
        const userTurn: ExecutorTurn = { id: crypto.randomUUID(), role: "user", stageId: stage?.id ?? activeStudioStageId, content: followUp ?? `Run stage: ${stage?.title ?? "full blueprint"}\n${stage?.goal ?? "Follow the full execution blueprint."}`, createdAt: now };
        const assistantTurn: ExecutorTurn = { id: crypto.randomUUID(), role: "assistant", stageId: stage?.id ?? activeStudioStageId, content: response.text.slice(0, 20_000), createdAt: new Date().toISOString() };
        setExecutorConversation((current) => [...current, userTurn, assistantTurn].slice(-60));
      }
    } catch (error) {
      setStreamError(errorText(error));
    } finally {
      activeStreamId.current = null;
      setStreaming(false);
    }
  };

  const runWorkflowStage = (stage: WorkflowStage) => {
    setActiveStudioStageId(stage.id);
    setStageProgress(stage.id, "in_progress", activeStageProgress.find((item) => item.stageId === stage.id)?.evidence ?? "");
    setPage("studio");
    void startStream(stage);
  };

  const copyWorkflowStage = async (stage: WorkflowStage) => {
    if (!displayedCompiled) return;
    try {
      let paths = stagedHandoffPaths;
      if (images.length && !paths && loop.state.result) {
        paths = [];
        for (const [index, image] of images.entries()) {
          const staged = await invoke<{ name: string; path: string }>("stage_handoff_image", { handoffId: sessionId.current ?? crypto.randomUUID(), index: index + 1, name: image.name, mimeType: image.mimeType, base64Data: image.base64 });
          paths.push(staged.path);
        }
        setStagedHandoffPaths(paths);
      }
      const attachments = images.map((image, index) => `[REF-${String(index + 1).padStart(2, "0")}] ${image.name} (${image.width}×${image.height})${paths?.[index] ? ` — local file: "${paths[index]}"` : ` — Executor image ${index + 1}`}`);
      const fullPrompt = loop.state.result ? compileExecutionPrompt({ originalPrompt: loop.state.originalPrompt, result: loop.state.result, answers: loop.state.answers, skills, skippedQuestions: loop.state.skippedQuestions, attachments, toolCatalog: settings.toolCatalog, memoryContext: requestMemoryContext.current }).text : displayedCompiled.text;
      await invoke("clipboard_write_text", { text: compileWorkflowStagePrompt(fullPrompt, stage, activeStageProgress) });
      setStageProgress(stage.id, "in_progress", activeStageProgress.find((item) => item.stageId === stage.id)?.evidence ?? "");
      setNotice(`Stage prompt copied: ${stage.title}. The prompt asks the Executor to stop after this stage.`);
    } catch (error) {
      setNotice(`Could not copy the stage prompt: ${errorText(error)}`);
    }
  };

  const sendExecutorFollowUp = (message: string) => {
    setExecutorChatDraft("");
    void startStream(activeStudioStage, message);
  };

  const copyExecutorFollowUp = async (message: string) => {
    if (!displayedCompiled) return;
    const stagePrompt = activeStudioStage ? compileWorkflowStagePrompt(displayedCompiled.text, activeStudioStage, activeStageProgress) : displayedCompiled.text;
    const transcript = executorConversation.slice(-30).map((turn) => `${turn.role === "user" ? "User" : "Executor"}:\n${turn.content}`).join("\n\n");
    const text = `${stagePrompt}\n\n## Follow-up conversation so far\n${transcript || "No prior conversation."}\n\n## User follow-up\n${message}\n\nReply to this follow-up only. Do not claim to run unavailable tests or tools.`;
    try {
      await invoke("clipboard_write_text", { text });
      const turn: ExecutorTurn = { id: crypto.randomUUID(), role: "user", stageId: activeStudioStageId, content: message, createdAt: new Date().toISOString() };
      setExecutorConversation((current) => [...current, turn].slice(-60));
      setNotice("Follow-up prompt copied for your IDE agent.");
    } catch (error) {
      setNotice(`Could not copy the follow-up prompt: ${errorText(error)}`);
    }
  };

  const recordExecutorReply = (message: string) => {
    const turn: ExecutorTurn = { id: crypto.randomUUID(), role: "assistant", stageId: activeStudioStageId, content: message, createdAt: new Date().toISOString() };
    setExecutorConversation((current) => [...current, turn].slice(-60));
    setNotice("Executor reply saved to this session.");
  };

  const navigate = (target: NavigationPage | "settings") => {
    if (target === "settings") setSettingsOpen(true);
    else setPage(target);
  };

  const visibleHistory = useMemo(() => history
    .filter((session) => Boolean(session.archived) === (historyFilter === "archived"))
    .filter((session) => `${session.title} ${session.prompt} ${session.compiledPrompt}`.toLowerCase().includes(historyQuery.trim().toLowerCase()))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [history, historyFilter, historyQuery]);

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <CelestialBackground scene={settings.backgroundScene} intensity={settings.backgroundIntensity} motion={settings.backgroundMotion} />
        <Sidebar page={page} history={history} settings={settings.providers} onNavigate={navigate} onOpenSession={openSession} onDeleteSession={removeSession} resources={resources.snapshot} resourceError={resources.error} monitorResources={settings.monitorResources} onRefreshResources={resources.refresh} />
        <main className="main-workspace">
          <AnimatePresence mode="wait">
            {!initialized ? (
              <motion.div key="loading" className="studio-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="studio-loading-mark"><Moon size={30} /></div>
                <p>Opening your prompt studio…</p>
              </motion.div>
            ) : page === "history" ? (
              <motion.div key="history" className="history-page page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <div className="page-title-row"><div><div className="eyebrow left">YOUR WORK</div><h1>Prompt history</h1><p>Reopen a blueprint and send it to your next tool.</p></div><button className="secondary-button" onClick={newPrompt}><Plus size={15} /> New prompt</button></div>
                {history.length > 0 && <div className="history-toolbar"><input className="history-search" aria-label="Search prompt history" placeholder="Search titles, prompts, and blueprints…" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /><div className="settings-segmented" role="group" aria-label="History filter"><button className={historyFilter === "active" ? "active" : ""} aria-pressed={historyFilter === "active"} onClick={() => setHistoryFilter("active")}>Active</button><button className={historyFilter === "archived" ? "active" : ""} aria-pressed={historyFilter === "archived"} onClick={() => setHistoryFilter("archived")}>Archived</button></div></div>}
                {history.length ? (visibleHistory.length ? <div className="history-grid">{visibleHistory.map((session) => (
                  <article key={session.id} className="history-card-shell glass-card">
                    <button className="history-card-open" onClick={() => openSession(session)}>
                      <span className="history-card-date"><Clock3 size={13} /> {new Date(session.updatedAt).toLocaleDateString()} {session.pinned && <span className="history-pinned-label"><Bookmark size={11} fill="currentColor" /> PINNED</span>}</span>
                      <strong>{session.title}</strong>
                      <span className="history-card-preview">{session.prompt}</span>
                      <span className="history-card-footer">{session.answerCount} clarifications <ArrowUpRight size={15} /></span>
                    </button>
                    <div className="history-card-actions">
                      <button title={session.pinned ? "Unpin prompt" : "Pin prompt"} aria-label={session.pinned ? "Unpin prompt" : "Pin prompt"} onClick={() => toggleSessionFlag(session.id, "pinned")}><Bookmark size={13} fill={session.pinned ? "currentColor" : "none"} />{session.pinned ? "Pinned" : "Pin"}</button>
                      <button title={session.archived ? "Restore prompt" : "Archive prompt"} onClick={() => toggleSessionFlag(session.id, "archived")}><Archive size={13} />{session.archived ? "Restore" : "Archive"}</button>
                      <button title="Export Markdown" aria-label={`Export ${session.title} as Markdown`} onClick={() => exportSession(session, "md")}><FileText size={13} />MD</button>
                      <button title="Export JSON" aria-label={`Export ${session.title} as JSON`} onClick={() => exportSession(session, "json")}><FileJson size={13} />JSON</button>
                      <button className="history-delete-action" title="Delete prompt" aria-label={`Delete ${session.title}`} onClick={() => removeSession(session)}><Trash2 size={13} /></button>
                    </div>
                  </article>
                ))}</div> : <div className="history-empty glass-card"><h2>{historyFilter === "archived" ? "No archived prompts" : "No matching prompts"}</h2><p>{historyFilter === "archived" ? "Archive a prompt to keep it out of your active list." : "Try another search or check the archived list."}</p></div>) : <div className="history-empty glass-card"><Sparkles size={22} /><h2>No blueprints yet</h2><p>Your compiled prompts will appear here after your first run.</p><button className="primary-button" onClick={newPrompt}>Create a prompt <ArrowUpRight size={14} /></button></div>}
              </motion.div>
            ) : page === "skills" ? (
              <motion.div key="skills" className="skills-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={motionTransitions.page}>
                <SkillManager onChanged={setSkills} onClose={() => setPage("forge")} />
              </motion.div>
            ) : page === "tools" ? (
              <motion.div key="tools" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}><ToolLibrary catalog={settings.toolCatalog} onSave={saveToolCatalog} onClose={() => setPage("forge")} /></motion.div>
            ) : page === "models" ? (
              <motion.div key="models" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}><ModelCenter providers={settings.providers} resources={resources.snapshot} preference={settings.modelPreference} contextRecommendation={loop.state.result?.context_recommendation ?? null} onProvidersChange={(providers) => saveModelSettings({ providers })} onPreferenceChange={(modelPreference) => saveModelSettings({ modelPreference })} /></motion.div>
            ) : page === "memory" ? (
              <motion.div key="memory" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}>{memoryLoadedSuccessfully ? <MemoryManager memory={memory} onChange={(next) => { void updateMemory(next); }} onDefaultChange={updateMemoryDefault} onClose={() => setPage("forge")} /> : <div className="memory-load-error glass-card"><Moon size={22} /><h2>Memory is read-only</h2><p>Lunaris could not safely read the saved memory file. It has not overwritten it. Restart after resolving the storage issue, or close this page and continue without memory.</p><button className="secondary-button" onClick={() => setPage("forge")}>Close</button></div>}</motion.div>
            ) : page === "studio" ? (
              <motion.div key="design-studio" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}>
                <DesignStudio session={activeSession} stages={activeWorkflowStages} progress={activeStageProgress} activeStageId={activeStudioStage?.id ?? null} compiledPrompt={displayedCompiled?.text ?? ""} mode={settings.providers.executorMode} model={settings.providers.executor.model} turns={executorConversation} streamingText={executorChatDraft} streaming={streaming} error={streamError} onSelectStage={setActiveStudioStageId} onRunStage={runWorkflowStage} onCopyStage={(stage) => void copyWorkflowStage(stage)} onSetStageStatus={setStageProgress} onFollowUp={sendExecutorFollowUp} onCopyFollowUp={(message) => void copyExecutorFollowUp(message)} onRecordReply={recordExecutorReply} onSaveRevision={saveBlueprintRevision} onRestoreRevision={restoreBlueprintRevision} onOpenBlueprint={() => setPage("forge")} />
              </motion.div>
            ) : page === "backup" ? (
              <motion.div key="backup" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}>
                <BackupManager settings={settings} history={{ sessions: history }} memory={memory} skills={skills} onImport={importBackup} onClose={() => setPage("forge")} />
              </motion.div>
            ) : loop.state.status === "idle" ? (
              <motion.div key="input" className="forge-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <PromptInput config={settings.providers.architect} memory={memory} selectedProjectId={selectedProjectId} memoryEnabled={includeMemory} customTemplates={settings.customPromptTemplates} skills={skills} toolCatalog={settings.toolCatalog} onSaveCustomTemplates={saveCustomTemplates} onProjectChange={setSelectedProjectId} onMemoryEnabledChange={(enabled) => { includeMemoryOverride.current = true; setIncludeMemory(enabled); }} onStart={startPrompt} />
              </motion.div>
            ) : loop.state.status === "ready" && displayedCompiled ? (
              <motion.div key="blueprint" className="blueprint-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <BlueprintViewer compiled={displayedCompiled} executorMode={settings.providers.executorMode} executorModel={settings.providers.executor.model} checklist={checklist} completedSteps={completedChecklistSteps} onToggleStep={toggleChecklistStep} onClearChecklist={clearChecklist} onCopyReview={(text) => void copyReviewPrompt(text)} answers={loop.state.answers} memory={memory} projectId={selectedProjectId} projectName={memory.projects.find((project) => project.id === selectedProjectId)?.name ?? null} onSaveMemory={saveAnswerMemory} onCopy={copyPrompt} onExport={(format) => { const session = currentSessionForExport(); if (session) exportSession(session, format); }} onStream={() => void startStream()} onStop={stopStream} streaming={streaming} executorText={executorText} streamError={streamError} onNewPrompt={newPrompt} />
              </motion.div>
            ) : (
              <motion.div key="clarification" className="clarification-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <ClarificationLoop state={loop.state} onAnswer={(id, answer) => void loop.answer(id, answer, effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot, activeMemoryContext)} onSkip={() => void loop.skipAndCompile(effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot, activeMemoryContext)} onRetry={() => void loop.retry(effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot, activeMemoryContext)} onBack={newPrompt} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{notice && <motion.div key="notice" className="notice-toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.panel}><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={14} /></button></motion.div>}</AnimatePresence>
          <footer className="workspace-footer"><span><Command size={12} /> {settings.providers.globalShortcut} to summon</span><span>CRAFTED FOR THE NEXT IDEA <Sparkles size={11} /></span></footer>
        </main>
      </div>
      <AnimatePresence>
        {settingsOpen && <ProviderSettings settings={settings.providers} theme={settings.theme} monitorResources={settings.monitorResources} backgroundScene={settings.backgroundScene} backgroundIntensity={settings.backgroundIntensity} backgroundMotion={settings.backgroundMotion} onSave={saveProviderSettings} onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {modelRequest && <ModelChangeRequest recommendation={modelRequest} currentModel={settings.providers.executor.model} runtime={settings.providers.executor.provider === "custom" ? "custom" : "ollama"} baseUrl={settings.providers.executor.provider === "custom" ? settings.providers.executor.baseUrl : settings.providers.executor.provider === "ollama" ? settings.providers.executor.baseUrl : settings.providers.architect.provider === "ollama" ? settings.providers.architect.baseUrl : "http://localhost:11434"} onAccept={acceptModelRequest} onDismiss={dismissModelRequest} />}
      </AnimatePresence>
    </div>
  );
}
