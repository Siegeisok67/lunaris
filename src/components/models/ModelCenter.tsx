import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Activity, ArrowLeft, Check, Code2, Cloud, Download, Eye, HardDrive, LoaderCircle, MessageSquareCode, RefreshCw, Search, Sparkles, Square, WandSparkles } from "lucide-react";
import { useOllamaModels } from "../../hooks/useOllamaModels";
import { DEFAULT_PROVIDER_URLS, PROVIDER_LABELS, type OllamaModel, type ProviderId, type ProviderModel, type ProviderSettings, type ResourceSnapshot } from "../../types/provider";
import { MODEL_CATALOG, OLLAMA_INSTALL_CATALOG, modelCapabilities } from "../../data/modelCatalog";
import type { ArchitectResult } from "../../types/architect";

interface ModelCenterProps {
  providers: ProviderSettings;
  resources: ResourceSnapshot | null;
  preference: "balanced" | "specialists";
  contextRecommendation: ArchitectResult["context_recommendation"];
  onProvidersChange: (providers: ProviderSettings) => void;
  onPreferenceChange: (preference: "balanced" | "specialists") => void;
}

interface PullProgress {
  requestId: string;
  model: string;
  status: string;
  completed: number | null;
  total: number | null;
  message: string | null;
}

interface BrowserModel {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  storageGb: number | null;
  estimatedVramGb: number | null;
  contextLength: number | null;
  installed: boolean;
  local: boolean;
}

const PROVIDER_IDS: ProviderId[] = ["ollama", "llamacpp", "openrouter", "openai", "anthropic", "custom"];

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "Not reported";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function formatEstimate(gb: number | null): string {
  return gb === null ? "Provider managed" : `~${gb} GB`;
}

function Capability({ name }: { name: string }) {
  const Icon = name === "vision" ? Eye : name === "coding" ? Code2 : name === "tool use" ? MessageSquareCode : Sparkles;
  return <span className="model-capability"><Icon size={12} />{name}</span>;
}

function capabilitiesForProviderModel(model: ProviderModel): string[] {
  const names = modelCapabilities(model.id);
  const modalities = model.architecture?.inputModalities ?? [];
  if (modalities.some((value) => value.toLowerCase().includes("image")) && !names.includes("vision")) names.push("vision");
  if (model.supportedParameters?.includes("tools") && !names.includes("tool use")) names.push("tool use");
  return names;
}

export function ModelCenter({ providers, resources, preference, contextRecommendation, onProvidersChange, onPreferenceChange }: ModelCenterProps) {
  const [catalogRole, setCatalogRole] = useState<"architect" | "executor">("executor");
  const [view, setView] = useState<"overview" | "install">("overview");
  const [browseProvider, setBrowseProvider] = useState<ProviderId>(providers.executor.provider);
  const [customEndpoint, setCustomEndpoint] = useState(() => providers.executor.provider === "custom" ? providers.executor.baseUrl : providers.architect.provider === "custom" ? providers.architect.baseUrl : "http://localhost:8085/v1");
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modelToInstall, setModelToInstall] = useState("qwen3-vl:8b");
  const [pull, setPull] = useState<PullProgress | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const activePullId = useRef<string | null>(null);
  const [contextDraft, setContextDraft] = useState({ architect: providers.architect.contextLength, executor: providers.executor.contextLength });
  const config = providers[catalogRole];
  const ollamaUrl = providers.architect.provider === "ollama"
    ? providers.architect.baseUrl
    : providers.executor.provider === "ollama"
      ? providers.executor.baseUrl
      : DEFAULT_PROVIDER_URLS.ollama;
  const ollamaConfig = { ...config, provider: "ollama" as const, baseUrl: ollamaUrl };
  const { models: ollamaModels, loading: ollamaLoading, error: ollamaError, refresh: refreshOllama } = useOllamaModels(ollamaConfig);
  const browseConfig = providers[catalogRole];
  const browseBaseUrl = browseProvider === "custom"
    ? customEndpoint
    : browseConfig.provider === browseProvider
      ? browseConfig.baseUrl
      : DEFAULT_PROVIDER_URLS[browseProvider];

  const refreshProviderModels = useCallback(async () => {
    if (browseProvider === "ollama") {
      await refreshOllama();
      return;
    }
    setProviderLoading(true);
    setProviderError(null);
    try {
      const result = await invoke<ProviderModel[]>("provider_list_models", {
        role: catalogRole,
        provider: browseProvider,
        baseUrl: browseBaseUrl || null,
      });
      setProviderModels(result);
    } catch (caught) {
      setProviderError(caught instanceof Error ? caught.message : String(caught));
      setProviderModels([]);
    } finally {
      setProviderLoading(false);
    }
  }, [browseProvider, catalogRole, browseBaseUrl, refreshOllama]);

  useEffect(() => { void refreshProviderModels(); }, [refreshProviderModels]);

  const installedOllama = ollamaModels;
  const installedCount = browseProvider === "ollama" ? installedOllama.length : providerModels.length;
  const loading = browseProvider === "ollama" ? ollamaLoading : providerLoading;
  const error = browseProvider === "ollama" ? ollamaError : providerError;
  const modelBytes = providers.executor.provider === "ollama"
    ? installedOllama.find((model) => model.name === providers.executor.model)?.size ?? 0
    : 0;
  const ollamaEstimate = OLLAMA_INSTALL_CATALOG.find((item) => item.model === providers.executor.model);
  const estimatedContextTokens = providers.executor.contextMode === "auto"
    ? resources?.vramTotalBytes && resources.vramTotalBytes - (resources.vramUsedBytes ?? 0) > 9 * 1024 ** 3 ? 32768 : 8192
    : providers.executor.contextLength;
  const contextBytes = Math.max(0.2, estimatedContextTokens / 4096 * 0.17) * 1024 ** 3;
  const availableMemoryGb = resources?.vramTotalBytes
    ? Math.max(0, resources.vramTotalBytes - (resources.vramUsedBytes ?? 0)) / 1024 ** 3
    : resources?.ramTotalBytes
      ? Math.max(0, resources.ramTotalBytes - (resources.ramUsedBytes ?? 0)) / 1024 ** 3
      : null;
  const recommendedArchitectContext = availableMemoryGb === null ? 8192 : availableMemoryGb >= 8 ? 16384 : availableMemoryGb >= 3 ? 8192 : 4096;
  const executorParameters = Number(/(\d+(?:\.\d+)?)\s*b/i.exec(providers.executor.model)?.[1] ?? 0);
  const recommendedExecutorContext = availableMemoryGb === null ? 16384
    : executorParameters >= 20 && availableMemoryGb < 12 ? 8192
      : availableMemoryGb >= 14 ? 32768
        : availableMemoryGb >= 7 ? 16384
          : availableMemoryGb >= 3 ? 8192 : 4096;
  const modelStorageBytes = modelBytes || (ollamaEstimate?.storageGb ? ollamaEstimate.storageGb * 1024 ** 3 : 0);
  const estimatedBytes = modelStorageBytes ? modelStorageBytes * 1.12 + contextBytes : null;
  const vramRatio = resources?.vramTotalBytes && estimatedBytes ? estimatedBytes / resources.vramTotalBytes : null;
  const vramPercent = vramRatio === null ? null : Math.min(100, vramRatio * 100);
  const barClass = vramRatio === null ? "" : vramRatio >= .8 ? "over-budget" : estimatedBytes !== null && estimatedBytes <= 2 * 1024 ** 3 ? "frost" : vramRatio >= .55 ? "warm" : "cool";
  const pullPercent = pull?.total ? Math.min(100, (pull.completed ?? 0) / pull.total * 100) : 0;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<PullProgress>("lunaris://ollama-pull", (event) => {
      const next = event.payload;
      if (next.requestId !== activePullId.current) return;
      setPull(next);
      if (next.status === "completed") {
        activePullId.current = null;
        setPull(null);
        void refreshOllama();
      } else if (next.status === "error") {
        activePullId.current = null;
        setPullError(next.message || "Ollama could not download this model.");
        setPull(null);
      }
    }).then((cleanup) => { unlisten = cleanup; });
    return () => unlisten?.();
  }, [refreshOllama]);

  const suggested = useMemo(() => preference === "specialists"
    ? MODEL_CATALOG
    : MODEL_CATALOG.filter((item) => item.role === "Architect" || item.capabilities.includes("vision")), [preference]);

  const assignModel = (role: "architect" | "executor", model: string, provider: ProviderId, baseUrl: string, vision: boolean) => {
    const updated = {
      ...providers,
      [role]: {
        ...providers[role],
        provider,
        baseUrl,
        model,
        visionEnabled: role === "executor" && vision,
      },
    };
    onProvidersChange(updated);
  };
  const choose = (role: "architect" | "executor", model: string, vision = modelCapabilities(model).includes("vision")) =>
    assignModel(role, model, browseProvider, browseBaseUrl, vision);

  const install = async (model = modelToInstall) => {
    const name = model.trim();
    if (!name || pull || browseProvider !== "ollama") return;
    setPullError(null);
    const requestId = crypto.randomUUID();
    activePullId.current = requestId;
    setPull({ requestId, model: name, status: "Starting", completed: null, total: null, message: null });
    try {
      await invoke("ollama_pull_model", { baseUrl: browseBaseUrl, model: name, requestId });
      setPull(null);
      await refreshOllama();
    } catch (caught) {
      activePullId.current = null;
      setPullError(caught instanceof Error ? caught.message : String(caught));
      setPull(null);
    }
  };

  const cancelPull = async () => {
    if (!pull) return;
    await invoke("cancel_provider_request", { requestId: pull.requestId });
    activePullId.current = null;
    setPullError("Model download cancelled.");
    setPull(null);
  };

  const catalogModels: BrowserModel[] = browseProvider === "ollama"
    ? [
      ...OLLAMA_INSTALL_CATALOG.map((item) => {
      const local = installedOllama.find((model) => model.name === item.model);
      return {
        id: item.model,
        name: item.model,
        description: item.description,
        capabilities: item.capabilities,
        storageGb: local?.size ? local.size / 1024 ** 3 : item.storageGb ?? null,
        estimatedVramGb: item.estimatedVramGb,
        contextLength: null,
        installed: Boolean(local),
        local: true,
      };
      }),
      ...installedOllama.filter((model) => !OLLAMA_INSTALL_CATALOG.some((item) => item.model === model.name)).map((model) => ({
        id: model.name,
        name: model.name,
        description: `Installed ${model.details?.parameterSize ?? "local"} model${model.details?.quantizationLevel ? ` · ${model.details.quantizationLevel}` : ""}.`,
        capabilities: modelCapabilities(model.name),
        storageGb: model.size ? model.size / 1024 ** 3 : null,
        estimatedVramGb: model.size ? Math.ceil(model.size * 1.18 / 1024 ** 3) : null,
        contextLength: null,
        installed: true,
        local: true,
      })),
    ]
    : providerModels.map((item) => ({
      id: item.id,
      name: item.name || item.id,
      description: item.description || `${PROVIDER_LABELS[browseProvider]} model available through the configured provider.`,
      capabilities: capabilitiesForProviderModel(item),
      storageGb: null,
      estimatedVramGb: null,
      contextLength: item.contextLength ?? null,
      installed: true,
      local: browseProvider === "llamacpp" || browseProvider === "custom",
    }));
  const filteredCatalog = catalogModels
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase()) || item.capabilities.some((capability) => capability.includes(search.toLowerCase())))
    .slice(0, browseProvider === "ollama" ? 100 : 120);

  const saveContext = (role: "architect" | "executor", value: number) => {
    const nextContext = Math.max(128, Math.min(2_000_000, Math.round(value)));
    setContextDraft((current) => ({ ...current, [role]: nextContext }));
    onProvidersChange({ ...providers, [role]: { ...providers[role], contextMode: "manual", contextLength: nextContext } });
  };
  const setContextMode = (role: "architect" | "executor", contextMode: "auto" | "manual") => {
    onProvidersChange({ ...providers, [role]: { ...providers[role], contextMode } });
  };
  const applyContextSuggestion = (architectTokens: number, executorTokens: number) => {
    onProvidersChange({
      ...providers,
      architect: { ...providers.architect, contextMode: "manual", contextLength: architectTokens },
      executor: { ...providers.executor, contextMode: "manual", contextLength: executorTokens },
    });
    setContextDraft({ architect: architectTokens, executor: executorTokens });
  };

  return <section className="models-page page-content">
    {view === "overview" ? <>
      <div className="page-title-row"><div><div className="eyebrow left">LOCAL MODEL STUDIO</div><h1>Models &amp; hardware</h1><p>Manage providers, compare context budgets, and choose models for each role.</p></div><div className="models-page-actions"><button className="secondary-button" onClick={() => { setBrowseProvider(providers[catalogRole].provider); setView("install"); }}><Download size={14} /> Install Models</button><button className="secondary-button" onClick={() => void refreshProviderModels()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh models</button></div></div>
      <div className="models-browser-toolbar"><div className="model-role-switch"><button className={catalogRole === "architect" ? "active" : ""} onClick={() => { setCatalogRole("architect"); setBrowseProvider(providers.architect.provider); }}>Architect · {PROVIDER_LABELS[providers.architect.provider]}</button><button className={catalogRole === "executor" ? "active" : ""} onClick={() => { setCatalogRole("executor"); setBrowseProvider(providers.executor.provider); }}>Executor · {PROVIDER_LABELS[providers.executor.provider]}</button></div><label className="models-provider-select"><span>Provider</span><select value={browseProvider} onChange={(event) => setBrowseProvider(event.target.value as ProviderId)}>{PROVIDER_IDS.map((id) => <option value={id} key={id}>{PROVIDER_LABELS[id]}</option>)}</select></label></div>
      {browseProvider === "custom" && <div className="custom-endpoint-panel"><label><span>OpenAI-compatible endpoint</span><input value={customEndpoint} onChange={(event) => setCustomEndpoint(event.target.value)} placeholder="http://localhost:8085/v1" /></label><small>Lunaris can browse models exposed at this endpoint. Load or download custom-server models through that server’s own controls.</small></div>}
      <div className="models-hardware-grid">
        <article className="model-hardware-card"><span>GRAPHICS MEMORY</span><strong>{resources?.vramUsedBytes !== null && resources?.vramTotalBytes ? `${formatBytes(resources.vramUsedBytes)} / ${formatBytes(resources.vramTotalBytes)}` : "Unavailable"}</strong><small>{resources?.gpuName || resources?.availability.gpu || "Waiting for GPU sample"}</small></article>
        <article className="model-hardware-card"><span>SYSTEM MEMORY</span><strong>{resources?.ramUsedBytes !== null && resources?.ramTotalBytes ? `${formatBytes(resources.ramUsedBytes)} / ${formatBytes(resources.ramTotalBytes)}` : "Unavailable"}</strong><small>Live readings are shown in the sidebar widget.</small></article>
        <article className="model-hardware-card"><span>{PROVIDER_LABELS[browseProvider].toUpperCase()}</span><strong>{loading ? "Scanning…" : error ? "Offline" : `${installedCount} available models`}</strong><small>{browseBaseUrl || "Provider default URL"}</small></article>
      </div>
      {error && <div className="model-inline-error" role="status">{error}{browseProvider === "ollama" ? " Start Ollama or check its URL in Settings." : " Check the provider endpoint and saved API key."}</div>}
      <div className="model-section-heading"><div><h2>Recommended setup</h2><p>Recommendations consider your preference and available hardware.</p></div><div className="settings-segmented"><button className={preference === "balanced" ? "active" : ""} onClick={() => onPreferenceChange("balanced")}>One balanced model</button><button className={preference === "specialists" ? "active" : ""} onClick={() => onPreferenceChange("specialists")}>Two specialists</button></div></div>
      <div className="model-recommendations">{suggested.map((item) => {
        const installed = installedOllama.some((model) => model.name === item.model);
        return <article className="model-card glass-card" key={item.model}><div className="model-card-heading"><div><span>{item.role.toUpperCase()} CANDIDATE</span><h3>{item.model}</h3></div>{installed ? <Check size={16} className="model-installed-icon" /> : <WandSparkles size={16} />}</div><p>{item.description}</p><div className="model-capabilities">{item.capabilities.map((name) => <Capability name={name} key={name} />)}</div><div className="model-card-footer"><small>{installed ? "Available · ready to select" : `~${item.estimatedVramGb} GB VRAM · ~${OLLAMA_INSTALL_CATALOG.find((model) => model.model === item.model)?.storageGb ?? "—"} GB download`}</small>{installed ? <button className="quiet-action" onClick={() => assignModel(item.role === "Architect" ? "architect" : "executor", item.model, "ollama", ollamaUrl, item.capabilities.includes("vision"))}>Use for {item.role.toLowerCase()}</button> : <button className="quiet-action" onClick={() => { setCatalogRole(item.role === "Architect" ? "architect" : "executor"); setBrowseProvider("ollama"); setView("install"); }}><Download size={12} /> Find in catalog</button>}</div></article>;
      })}</div>
      <div className="model-section-heading"><div><h2>VRAM estimate</h2><p>Approximation for the current Executor model and context. Actual usage depends on quantization and runtime.</p></div></div>
      <section className={`vram-estimator ${barClass}`}><div className="vram-estimator-heading"><strong>Estimated VRAM usage</strong><span>{estimatedBytes ? `${formatBytes(estimatedBytes)}${modelStorageBytes ? ` model + ${formatBytes(contextBytes)} context` : ""}` : "Select a local Executor model"}{resources?.vramTotalBytes ? ` / ${formatBytes(resources.vramTotalBytes)}` : ""}</span></div><div className="vram-track"><div className="vram-fill" style={{ width: `${vramPercent ?? 0}%` }}><div className="vram-spark" aria-hidden="true" /></div><div className="vram-frost" aria-hidden="true" /></div><div className="vram-estimator-footer"><span>❄ Freezing ≤2 GB</span><span>{vramRatio === null ? "Local VRAM estimate unavailable" : vramRatio >= .8 ? "At least 80% · memory pressure" : estimatedBytes !== null && estimatedBytes <= 2 * 1024 ** 3 ? "Low use · freezing" : vramRatio >= .55 ? "Approaching budget" : "Estimated model + KV cache"}</span><span>Budget</span></div></section>
      <div className="model-section-heading"><div><h2>{PROVIDER_LABELS[browseProvider]} models</h2><p>Models currently exposed by this provider. Select one to assign it to {catalogRole}.</p></div><button className="quiet-action" onClick={() => setView("install")}><Search size={13} /> Browse and install</button></div>
      {catalogModels.filter((model) => model.installed).length ? <div className="model-installed-list">{catalogModels.filter((model) => model.installed).slice(0, 20).map((model) => <article className="model-installed-row" key={model.id}><div><h3>{model.name}</h3><small>{model.local ? `${formatEstimate(model.storageGb)} storage · ${formatEstimate(model.estimatedVramGb)} VRAM` : `Provider-hosted · ${model.contextLength ? `${model.contextLength.toLocaleString()} context` : "context metadata unavailable"}`}</small><div className="model-capabilities">{model.capabilities.map((name) => <Capability name={name} key={name} />)}</div></div><button className="secondary-button" onClick={() => choose(catalogRole, model.id, model.capabilities.includes("vision"))}>Use for {catalogRole}</button></article>)}</div> : <div className="models-empty glass-card"><Activity size={19} /><p>Choose a model provider or open Install Models to browse available downloads.</p></div>}
      {browseProvider === "ollama" ? <section className="model-download-panel glass-card"><div><h2>Download by model ID</h2><p>For any additional model in the Ollama library, enter its exact model ID.</p></div><div className="model-download-controls"><input value={modelToInstall} onChange={(event) => setModelToInstall(event.target.value)} placeholder="e.g. qwen3-vl:8b" disabled={Boolean(pull)} /><button className="primary-button" onClick={() => void install()} disabled={!modelToInstall.trim() || Boolean(pull)}>{pull ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{pull ? "Downloading…" : "Download"}</button></div>{pullError && <p className="model-inline-error" role="status">{pullError}</p>}</section> : null}
      {pull && <div className="model-pull-progress"><div><span>{pull.model} · {pull.status}</span><button onClick={() => void cancelPull()}><Square size={12} /> Cancel</button></div><i><b style={{ width: `${pullPercent}%` }} /></i><small>{pull.total ? `${formatBytes(pull.completed)} / ${formatBytes(pull.total)}` : "Preparing download…"}</small></div>}
      <div className="model-section-heading"><div><h2>Context length</h2><p>Higher context retains more project detail and uses more memory. Hosted providers enforce their own model limits; llama.cpp uses its server setting.</p></div></div>
      {contextRecommendation && <section className="context-suggestion-card architect-context-suggestion"><div><span>ARCHITECT SUGGESTION</span><strong>{contextRecommendation.architect_tokens.toLocaleString()} Architect · {contextRecommendation.executor_tokens.toLocaleString()} Executor tokens</strong><p>{contextRecommendation.rationale}</p></div><button type="button" className="secondary-button" onClick={() => applyContextSuggestion(contextRecommendation.architect_tokens, contextRecommendation.executor_tokens)}>Use Architect’s context values</button></section>}
      <section className="context-suggestion-card"><div><span>HARDWARE FIT · BASED ON CURRENT MODELS</span><strong>{recommendedArchitectContext.toLocaleString()} Architect · {recommendedExecutorContext.toLocaleString()} Executor tokens</strong><p>{availableMemoryGb === null ? "Hardware memory counters are unavailable; using a conservative baseline." : `${availableMemoryGb.toFixed(1)} GB currently free; suggestions account for the selected Executor model size.`} You can review both values below before using them.</p></div><button type="button" className="primary-button" onClick={() => applyContextSuggestion(recommendedArchitectContext, recommendedExecutorContext)}>Use recommended context</button></section>
      <p className="context-picker-tip">If you don't understand what this does, it is recommended to leave it at 16k-32k.</p>
      <div className="context-budget-grid">{(["architect", "executor"] as const).map((role) => <div className="context-budget-card" key={role}><span>{role.toUpperCase()} CONTEXT · {providers[role].contextMode === "manual" ? `${contextDraft[role].toLocaleString()} TOKENS` : "AUTO"}</span><div className="context-mode-picker"><button type="button" className={providers[role].contextMode !== "manual" ? "active" : ""} onClick={() => setContextMode(role, "auto")}>Auto</button><button type="button" className={providers[role].contextMode === "manual" ? "active" : ""} onClick={() => setContextMode(role, "manual")}>Manual</button></div><input type="range" min="2048" max="131072" step="2048" disabled={providers[role].contextMode !== "manual"} value={Math.min(131072, contextDraft[role])} onChange={(event) => saveContext(role, Number(event.target.value))} /><small>{providers[role].contextMode === "manual" ? "Fixed value for each request. llama.cpp requires a server restart after context changes." : role === "architect" ? "Lunaris selects 4K–8K from available memory and your request." : "Lunaris selects 4K–64K from available memory, model size, and task complexity."}</small></div>)}</div>
    </> : <>
      <div className="page-title-row"><div><div className="eyebrow left">MODEL LIBRARY</div><h1>Install Models</h1><p>Browse provider models, compare memory and storage, then download or select.</p></div><button className="secondary-button" onClick={() => setView("overview")}><ArrowLeft size={14} /> Back to Models</button></div>
      <div className="model-library-toolbar"><div className="model-role-switch"><button className={catalogRole === "architect" ? "active" : ""} onClick={() => { setCatalogRole("architect"); setBrowseProvider(providers.architect.provider); }}>Architect</button><button className={catalogRole === "executor" ? "active" : ""} onClick={() => { setCatalogRole("executor"); setBrowseProvider(providers.executor.provider); }}>Executor</button></div><label className="models-provider-select"><span>Model provider</span><select value={browseProvider} onChange={(event) => setBrowseProvider(event.target.value as ProviderId)}>{PROVIDER_IDS.map((id) => <option value={id} key={id}>{PROVIDER_LABELS[id]}</option>)}</select></label></div>
      {browseProvider === "custom" && <div className="custom-endpoint-panel"><label><span>OpenAI-compatible endpoint</span><input value={customEndpoint} onChange={(event) => setCustomEndpoint(event.target.value)} placeholder="http://localhost:8085/v1" /></label><small>This server exposes models it already manages. Download or load models using its own controls.</small></div>}
      {browseProvider === "llamacpp" && <div className="custom-endpoint-panel"><small>llama.cpp models are listed from the configured server. Change its endpoint and load GGUF files in Provider Settings.</small></div>}
      <div className="model-library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${PROVIDER_LABELS[browseProvider]} models or capabilities`} /><button className="quiet-action" onClick={() => void refreshProviderModels()} disabled={loading}><RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh</button></div>
      <div className="model-library-caption"><span>{loading ? "Loading provider catalog…" : `${catalogModels.length} ${browseProvider === "ollama" ? "curated Ollama models" : `${PROVIDER_LABELS[browseProvider]} models`}`}</span><span>{catalogRole} role</span></div>
      {error && <div className="model-inline-error" role="status">{error}</div>}
      {browseProvider === "ollama" && <p className="model-library-note">Ollama’s local API lists installed models, not its full public library. This searchable starter catalog includes common models; enter any exact Ollama library ID below to install another.</p>}
      <div className="model-library-grid">{filteredCatalog.map((model) => <article className="model-card glass-card model-library-card" key={model.id}><div className="model-card-heading"><div><span>{model.installed ? "AVAILABLE" : model.local ? "OLLAMA DOWNLOAD" : PROVIDER_LABELS[browseProvider].toUpperCase()}</span><h3>{model.name}</h3></div>{model.installed ? <Check size={16} className="model-installed-icon" /> : model.local ? <Download size={15} /> : <Cloud size={15} />}</div><p>{model.description}</p><div className="model-capabilities">{model.capabilities.map((name) => <Capability name={name} key={name} />)}</div><div className="model-library-metadata"><span><HardDrive size={12} />{model.local ? `${formatEstimate(model.storageGb)} storage` : "Provider managed storage"}</span><span><Activity size={12} />{formatEstimate(model.estimatedVramGb)} VRAM</span>{model.contextLength && <span>{model.contextLength.toLocaleString()} context</span>}</div><div className="model-card-footer"><small>{model.local ? "Approximate Q4 size; quantization changes actual usage." : model.local === false && (browseProvider === "custom" || browseProvider === "llamacpp") ? "Hosted by your local server" : "Hosted by provider; no local download"}</small>{model.local && !model.installed ? <button className="quiet-action" onClick={() => void install(model.id)} disabled={Boolean(pull)}><Download size={12} /> Download</button> : <button className="quiet-action" onClick={() => choose(catalogRole, model.id, model.capabilities.includes("vision"))}>Use for {catalogRole}</button>}</div></article>)}</div>
      {!loading && !filteredCatalog.length && <div className="models-empty glass-card"><Search size={19} /><p>{error ? "Provider catalog unavailable." : "No models match your search."}</p></div>}
      {browseProvider === "ollama" && <section className="model-download-panel glass-card"><div><h2>Install another Ollama model</h2><p>Enter any exact model ID from the Ollama library. The download is stored by your Ollama runtime.</p></div><div className="model-download-controls"><input value={modelToInstall} onChange={(event) => setModelToInstall(event.target.value)} placeholder="e.g. qwen3-vl:8b" disabled={Boolean(pull)} /><button className="primary-button" onClick={() => void install()} disabled={!modelToInstall.trim() || Boolean(pull)}>{pull ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{pull ? "Downloading…" : "Download model"}</button></div></section>}
      {pull && <div className="model-pull-progress"><div><span>{pull.model} · {pull.status}</span><button onClick={() => void cancelPull()}><Square size={12} /> Cancel</button></div><i><b style={{ width: `${pullPercent}%` }} /></i><small>{pull.total ? `${formatBytes(pull.completed)} / ${formatBytes(pull.total)}` : "Preparing download…"}</small></div>}
      {pullError && <p className="model-inline-error" role="status">{pullError}</p>}
    </>}
  </section>;
}
