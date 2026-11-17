import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { ArrowUpRight, Clock3, Command, Moon, Plus, Sparkles, X } from "lucide-react";
import { Titlebar } from "./components/layout/Titlebar";
import { CelestialBackground } from "./components/layout/CelestialBackground";
import { Sidebar, type NavigationPage } from "./components/layout/Sidebar";
import { PromptInput } from "./components/forge/PromptInput";
import { ClarificationLoop } from "./components/forge/ClarificationLoop";
import { BlueprintViewer } from "./components/forge/BlueprintViewer";
import { ProviderSettings } from "./components/modals/ProviderSettings";
import { SkillManager } from "./components/modals/SkillManager";
import { ToolLibrary } from "./components/modals/ToolLibrary";
import { ModelCenter } from "./components/models/ModelCenter";
import { ModelChangeRequest, type ExecutorRecommendation } from "./components/models/ModelChangeRequest";
import { useSystemResources } from "./hooks/useSystemResources";
import { MODEL_CATALOG, modelCapabilities } from "./data/modelCatalog";
import { resourceContext } from "./lib/resourceContext";
import { useClarificationLoop } from "./hooks/useClarificationLoop";
import { cancelStream, streamText } from "./lib/llmRouter";
import { compileExecutionPrompt } from "./lib/promptCompiler";
import { motionTransitions } from "./lib/motion";
import { loadHistory, loadSettings, loadSkills, saveHistory, saveSettings, type LunarisSettings } from "./lib/storage";
import type { PromptSession, ReferenceImage } from "./types/architect";
import { DEFAULT_PROVIDER_SETTINGS } from "./types/provider";
import type { ProviderSettings as ProviderSettingsType } from "./types/provider";
import type { SkillDefinition } from "./types/skills";
import type { ToolCatalog } from "./types/tools";

const INITIAL_SETTINGS: LunarisSettings = {
  providers: DEFAULT_PROVIDER_SETTINGS,
  selectedNavigation: "forge",
  toolCatalog: { applications: [], mcpServers: [] },
  theme: "lunar",
  monitorResources: true,
  modelPreference: "balanced",
};

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
  const [history, setHistory] = useState<PromptSession[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [stagedHandoffPaths, setStagedHandoffPaths] = useState<string[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [executorText, setExecutorText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [modelRequest, setModelRequest] = useState<ExecutorRecommendation | null>(null);
  const sessionId = useRef<string | null>(null);
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
    void Promise.allSettled([loadSettings(), loadHistory(), loadSkills()]).then(async ([savedSettings, savedHistory, savedSkills]) => {
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
    });
  }, [loop.state.status, loop.state.result, loop.state.originalPrompt, loop.state.answers, loop.state.skippedQuestions, skills, referenceLines.join("\n"), settings.toolCatalog]);

  const displayedCompiled = useMemo(() => {
    if (!compiled || !restoredSession.current) return compiled;
    const saved = history.find((session) => session.id === sessionId.current);
    return saved?.compiledPrompt ? { ...compiled, text: saved.compiledPrompt } : compiled;
  }, [compiled, history]);

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
      };
      return [session, ...current.filter((item) => item.id !== id)].slice(0, 250);
    });
  }, [compiled, loop.state.originalPrompt, loop.state.result, loop.state.answers, loop.state.skippedQuestions]);

  const startPrompt = (prompt: string, attachments: ReferenceImage[]) => {
    setModelRequest(null);
    sessionId.current = crypto.randomUUID();
    restoredSession.current = false;
    setImages(attachments);
    setStagedHandoffPaths(null);
    setExecutorText("");
    setStreamError(null);
    setPage("forge");
    void loop.start(prompt, attachments, effectiveContext(settings.providers.architect, "architect", resources.snapshot, prompt, attachments.length), skills, settings.toolCatalog, executorContextSummary(settings.providers.executor, resources.snapshot, prompt, attachments.length), resources.snapshot);
  };

  const newPrompt = () => {
    setModelRequest(null);
    if (activeStreamId.current) void cancelStream(activeStreamId.current);
    sessionId.current = null;
    restoredSession.current = false;
    activeStreamId.current = null;
    stopRequested.current = false;
    setImages([]);
    setStagedHandoffPaths(null);
    setExecutorText("");
    setStreamError(null);
    loop.reset();
    setPage("forge");
  };

  const openSession = (session: PromptSession) => {
    setModelRequest(null);
    if (activeStreamId.current) void cancelStream(activeStreamId.current);
    sessionId.current = session.id;
    restoredSession.current = true;
    setImages([]);
    setStagedHandoffPaths(null);
    setExecutorText("");
    setStreamError(null);
    loop.restore(session);
    setPage("forge");
  };

  const saveProviderSettings = async (providers: ProviderSettingsType, appearance: { theme: LunarisSettings["theme"]; monitorResources: boolean }) => {
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

  const startStream = async () => {
    if (!displayedCompiled || streaming) return;
    if (!settings.providers.executor.model.trim()) {
      setStreamError("Choose an Executor model in Provider Settings first.");
      return;
    }
    setStreaming(true);
    setStreamError(null);
    setExecutorText("");
    stopRequested.current = false;
    activeStreamId.current = null;
    try {
    await streamText({
        role: "executor",
        config: images.length > 0
          ? { ...effectiveContext(settings.providers.executor, "executor", resources.snapshot, displayedCompiled.text, images.length), visionEnabled: true }
          : effectiveContext(settings.providers.executor, "executor", resources.snapshot, displayedCompiled.text, images.length),
        images,
        maxTokens: 4096,
        messages: [
          { role: "system", content: `You are the execution AI receiving a complete Lunaris blueprint. Follow the plan as far as your available tools permit. If you cannot access a project, provide concrete steps and state the limitation.\n\nCURRENT COMPUTER RESOURCES (timestamped advisory snapshot)\n${resourceContext(resources.snapshot)}` },
          { role: "user", content: displayedCompiled.text },
        ],
      }, (delta) => setExecutorText((current) => current + delta), (id) => {
        activeStreamId.current = id;
        if (stopRequested.current) void requestStop(id);
      });
    } catch (error) {
      setStreamError(errorText(error));
    } finally {
      activeStreamId.current = null;
      setStreaming(false);
    }
  };

  const navigate = (target: NavigationPage | "settings") => {
    if (target === "settings") setSettingsOpen(true);
    else setPage(target);
  };

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <CelestialBackground />
        <Sidebar page={page} history={history} settings={settings.providers} onNavigate={navigate} onOpenSession={openSession} resources={resources.snapshot} resourceError={resources.error} monitorResources={settings.monitorResources} onRefreshResources={resources.refresh} />
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
                {history.length > 0 && <input className="history-search" aria-label="Search prompt history" placeholder="Search titles and prompts…" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} />}
                {history.length ? (history.filter((session) => `${session.title} ${session.prompt}`.toLowerCase().includes(historyQuery.trim().toLowerCase())).length ? <div className="history-grid">{history.filter((session) => `${session.title} ${session.prompt}`.toLowerCase().includes(historyQuery.trim().toLowerCase())).map((session) => (
                  <button key={session.id} className="history-card glass-card" onClick={() => openSession(session)}>
                    <span className="history-card-date"><Clock3 size={13} /> {new Date(session.updatedAt).toLocaleDateString()}</span>
                    <strong>{session.title}</strong>
                    <span className="history-card-preview">{session.prompt}</span>
                    <span className="history-card-footer">{session.answerCount} clarifications <ArrowUpRight size={15} /></span>
                  </button>
                ))}</div> : <div className="history-empty glass-card"><h2>No matching prompts</h2><p>Try a different search.</p></div>) : <div className="history-empty glass-card"><Sparkles size={22} /><h2>No blueprints yet</h2><p>Your compiled prompts will appear here after your first run.</p><button className="primary-button" onClick={newPrompt}>Create a prompt <ArrowUpRight size={14} /></button></div>}
              </motion.div>
            ) : page === "skills" ? (
              <motion.div key="skills" className="skills-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={motionTransitions.page}>
                <SkillManager onChanged={setSkills} onClose={() => setPage("forge")} />
              </motion.div>
            ) : page === "tools" ? (
              <motion.div key="tools" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}><ToolLibrary catalog={settings.toolCatalog} onSave={saveToolCatalog} onClose={() => setPage("forge")} /></motion.div>
            ) : page === "models" ? (
              <motion.div key="models" className="workspace-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}><ModelCenter providers={settings.providers} resources={resources.snapshot} preference={settings.modelPreference} contextRecommendation={loop.state.result?.context_recommendation ?? null} onProvidersChange={(providers) => saveModelSettings({ providers })} onPreferenceChange={(modelPreference) => saveModelSettings({ modelPreference })} /></motion.div>
            ) : loop.state.status === "idle" ? (
              <motion.div key="input" className="forge-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <PromptInput config={settings.providers.architect} onStart={startPrompt} />
              </motion.div>
            ) : loop.state.status === "ready" && displayedCompiled ? (
              <motion.div key="blueprint" className="blueprint-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <BlueprintViewer compiled={displayedCompiled} executorMode={settings.providers.executorMode} executorModel={settings.providers.executor.model} onCopy={copyPrompt} onStream={() => void startStream()} onStop={stopStream} streaming={streaming} executorText={executorText} streamError={streamError} onNewPrompt={newPrompt} />
              </motion.div>
            ) : (
              <motion.div key="clarification" className="clarification-page page-content" initial={{ opacity: 0, y: 9, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={motionTransitions.page}>
                <ClarificationLoop state={loop.state} onAnswer={(id, answer) => void loop.answer(id, answer, effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot)} onSkip={() => void loop.skipAndCompile(effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot)} onRetry={() => void loop.retry(effectiveContext(settings.providers.architect, "architect", resources.snapshot, loop.state.originalPrompt, images.length), skills, settings.toolCatalog, images, executorContextSummary(settings.providers.executor, resources.snapshot, loop.state.originalPrompt, images.length), resources.snapshot)} onBack={newPrompt} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{notice && <motion.div key="notice" className="notice-toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.panel}><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={14} /></button></motion.div>}</AnimatePresence>
          <footer className="workspace-footer"><span><Command size={12} /> {settings.providers.globalShortcut} to summon</span><span>CRAFTED FOR THE NEXT IDEA <Sparkles size={11} /></span></footer>
        </main>
      </div>
      <AnimatePresence>
        {settingsOpen && <ProviderSettings settings={settings.providers} theme={settings.theme} monitorResources={settings.monitorResources} onSave={saveProviderSettings} onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {modelRequest && <ModelChangeRequest recommendation={modelRequest} currentModel={settings.providers.executor.model} runtime={settings.providers.executor.provider === "custom" ? "custom" : "ollama"} baseUrl={settings.providers.executor.provider === "custom" ? settings.providers.executor.baseUrl : settings.providers.executor.provider === "ollama" ? settings.providers.executor.baseUrl : settings.providers.architect.provider === "ollama" ? settings.providers.architect.baseUrl : "http://localhost:11434"} onAccept={acceptModelRequest} onDismiss={dismissModelRequest} />}
      </AnimatePresence>
    </div>
  );
}
