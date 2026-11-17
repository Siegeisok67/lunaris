import { useEffect, useState, type FormEvent } from "react";

import { invoke } from "@tauri-apps/api/core";

import { motion } from "framer-motion";

import {

  Check,

  Cpu,

  Eye,

  EyeOff,

  KeyRound,

  LoaderCircle,

  RefreshCw,

  Play,

  Save,

  Settings2,

  Square,

  Trash2,

  X,

} from "lucide-react";

import { useOllamaModels } from "../../hooks/useOllamaModels";

import { deleteProviderSecret, providerSecretExists, saveProviderSecret } from "../../lib/storage";

import { motionTransitions } from "../../lib/motion";

import {

  DEFAULT_PROVIDER_URLS,

  PROVIDER_LABELS,

  type ProviderConfig,

  type AppTheme,
  type BackgroundMotion,
  type BackgroundScene,

  type ProviderId,

  type ProviderRole,

  type ProviderSettings as ProviderSettingsValue,

} from "../../types/provider";



interface ProviderSettingsProps {

  settings: ProviderSettingsValue;

  theme: AppTheme;

  monitorResources: boolean;
  backgroundScene: BackgroundScene;
  backgroundIntensity: number;
  backgroundMotion: BackgroundMotion;
  onSave: (settings: ProviderSettingsValue, appearance: { theme: AppTheme; monitorResources: boolean; backgroundScene: BackgroundScene; backgroundIntensity: number; backgroundMotion: BackgroundMotion }) => Promise<void>;

  onClose: () => void;

}



interface ProviderCardProps {

  role: ProviderRole;

  config: ProviderConfig;

  onChange: (config: ProviderConfig) => void;

}



const PROVIDERS = Object.keys(PROVIDER_LABELS) as ProviderId[];



function errorMessage(error: unknown): string {

  return error instanceof Error ? error.message : String(error);

}



function ProviderCard({ role, config, onChange }: ProviderCardProps) {

  const { models, loading: modelsLoading, error: modelsError, refresh } = useOllamaModels(config);

  const [secret, setSecret] = useState("");

  const [secretExists, setSecretExists] = useState<boolean | null>(null);

  const [secretBusy, setSecretBusy] = useState(false);

  const [secretError, setSecretError] = useState<string | null>(null);

  const [secretMessage, setSecretMessage] = useState<string | null>(null);

  const [showSecret, setShowSecret] = useState(false);

  const [llamaCacheTypesK, setLlamaCacheTypesK] = useState<string[]>(["f16"]);

  const [llamaCacheTypesV, setLlamaCacheTypesV] = useState<string[]>(["f16"]);

  const [llamaStatus, setLlamaStatus] = useState<string | null>(null);

  const [llamaRunning, setLlamaRunning] = useState(false);

  const [llamaBusy, setLlamaBusy] = useState(false);

  const usesSecret = config.provider !== "ollama" && config.provider !== "llamacpp";

  const title = role === "architect" ? "Architect" : "Executor";



  useEffect(() => {

    let active = true;

    setSecret("");

    setSecretError(null);

    setSecretMessage(null);

    setShowSecret(false);

    setSecretExists(null);

    if (!usesSecret) return () => { active = false; };

    void providerSecretExists(role, config.provider)

      .then((exists) => { if (active) setSecretExists(exists); })

      .catch((error: unknown) => { if (active) setSecretError(errorMessage(error)); });

    return () => { active = false; };

  }, [role, config.provider, usesSecret]);



  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {

    onChange({ ...config, [key]: value });

  };



  const changeProvider = (provider: ProviderId) => {

    onChange({

      ...config,

      provider,

      model: "",

      baseUrl: provider === "llamacpp"

        ? `http://127.0.0.1:${role === "architect" ? "8081" : "8082"}/v1`

        : DEFAULT_PROVIDER_URLS[provider],

      visionEnabled: false,

    });

  };



  useEffect(() => {

    if (config.provider !== "llamacpp") return;

    let active = true;

    void invoke<boolean>("llama_server_is_running", { role }).then((running) => {

      if (active) setLlamaRunning(running);

    }).catch(() => { if (active) setLlamaRunning(false); });

    return () => { active = false; };

  }, [config.provider, role]);



  const detectLlamaCacheTypes = async () => {

    if (!config.llamaServerPath.trim()) {

      setLlamaStatus("Enter the path to llama-server first.");

      return;

    }

    setLlamaBusy(true);

    setLlamaStatus(null);

    try {

      const types = await invoke<{ key: string[]; value: string[] }>("llama_cache_types", { executablePath: config.llamaServerPath });

      setLlamaCacheTypesK(types.key);

      setLlamaCacheTypesV(types.value);

      setLlamaStatus(`Detected K: ${types.key.join(", ")} Â· V: ${types.value.join(", ")}`);

    } catch (error) {

      setLlamaStatus(errorMessage(error));

    } finally {

      setLlamaBusy(false);

    }

  };



  const startLlamaServer = async () => {

    setLlamaBusy(true);

    setLlamaStatus(null);

    try {

      await invoke<number>("llama_server_start", {

        role,

        executablePath: config.llamaServerPath,

        modelPath: config.llamaModelPath,

        modelName: config.model,

        port: config.llamaPort,

        contextLength: config.contextLength,

        cacheTypeK: config.cacheTypeK,

        cacheTypeV: config.cacheTypeV,

      });

      update("baseUrl", `http://127.0.0.1:${config.llamaPort}/v1`);

      setLlamaRunning(true);

      setLlamaStatus("llama-server is ready with the selected context and KV cache formats.");

    } catch (error) {

      setLlamaStatus(errorMessage(error));

    } finally {

      setLlamaBusy(false);

    }

  };



  const stopLlamaServer = async () => {

    setLlamaBusy(true);

    setLlamaStatus(null);

    try {

      await invoke("llama_server_stop", { role });

      setLlamaRunning(false);

      setLlamaStatus("llama-server stopped.");

    } catch (error) {

      setLlamaStatus(errorMessage(error));

    } finally {

      setLlamaBusy(false);

    }

  };



  const saveSecret = async () => {

    if (!secret.trim()) {

      setSecretError("Enter an API key before saving it.");

      return;

    }

    setSecretBusy(true);

    setSecretError(null);

    setSecretMessage(null);

    try {

      await saveProviderSecret(role, config.provider, secret.trim());

      setSecret("");

      setSecretExists(true);

      setSecretMessage("API key saved in the system credential store.");

    } catch (error) {

      setSecretError(errorMessage(error));

    } finally {

      setSecretBusy(false);

    }

  };



  const removeSecret = async () => {

    setSecretBusy(true);

    setSecretError(null);

    setSecretMessage(null);

    try {

      await deleteProviderSecret(role, config.provider);

      setSecret("");

      setSecretExists(false);

      setSecretMessage("Saved API key removed.");

    } catch (error) {

      setSecretError(errorMessage(error));

    } finally {

      setSecretBusy(false);

    }

  };



  return (

    <section className="settings-provider-card" aria-label={`${title} provider`}>

      <div className="settings-card-heading">

        <div className="settings-role-icon"><Settings2 size={17} /></div>

        <div>

          <span className="settings-eyebrow">{role === "architect" ? "01 / REASONING" : "02 / OUTPUT"}</span>

          <h3>{title}</h3>

          <p>{role === "architect" ? "Clarifies your request and assembles the plan." : "Generates a response when streaming is enabled."}</p>

        </div>

      </div>



      <div className="settings-field-grid">

        <label className="settings-field">

          <span>Provider</span>

          <select value={config.provider} onChange={(event) => changeProvider(event.target.value as ProviderId)}>

            {PROVIDERS.map((provider) => <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>)}

          </select>

        </label>

        <label className="settings-field">

          <span>{config.provider === "llamacpp" ? "Server model name" : "Model"}</span>

          <input

            value={config.model}

            onChange={(event) => update("model", event.target.value)}

            list={`${role}-ollama-models`}

            placeholder={config.provider === "ollama" ? "Choose or enter a local model" : config.provider === "llamacpp" ? "local-model" : "Enter a model ID"}

            spellCheck={false}

          />

          {config.provider === "ollama" && (

            <datalist id={`${role}-ollama-models`}>

              {models.map((model) => <option key={model.name} value={model.name} />)}

            </datalist>

          )}

        </label>

      </div>



      <label className="settings-field settings-url-field">

        <span>Base URL</span>

        <input

          type="url"

          value={config.baseUrl}

          onChange={(event) => update("baseUrl", event.target.value)}

          placeholder="https://api.example.com/v1"

          spellCheck={false}

        />

      </label>



      {config.provider === "ollama" && (

        <div className="settings-model-refresh">

          <button type="button" className="quiet-action" onClick={() => void refresh()} disabled={modelsLoading}>

            {modelsLoading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}

            {modelsLoading ? "Finding local modelsâ€¦" : "Refresh local models"}

          </button>

          {models.length > 0 && <span>{models.length} found</span>}

          {modelsError && <p className="inline-error" role="alert">{modelsError}</p>}

        </div>

      )}



      {config.provider === "llamacpp" && (

        <div className="llama-runtime-settings">

          <div className="llama-runtime-heading"><Cpu size={15} /><div><strong>Direct llama.cpp server</strong><small>Lunaris starts your selected llama-server with these KV cache settings.</small></div></div>

          <label className="settings-field"><span>llama-server executable</span><input value={config.llamaServerPath} onChange={(event) => update("llamaServerPath", event.target.value)} placeholder={'C:\\llama.cpp\\build\\bin\\Release\\llama-server.exe'} spellCheck={false} /></label>

          <label className="settings-field"><span>GGUF model file</span><input value={config.llamaModelPath} onChange={(event) => update("llamaModelPath", event.target.value)} placeholder={'D:\\Models\\model.Q4_K_M.gguf'} spellCheck={false} /></label>

          <div className="settings-field-grid llama-cache-grid">

            <label className="settings-field"><span>Context tokens</span><input type="number" min="128" max="2000000" step="1024" value={config.contextLength} onChange={(event) => onChange({ ...config, contextMode: "manual", contextLength: Math.max(128, Number(event.target.value) || 128) })} /></label>

            <label className="settings-field"><span>Local port</span><input type="number" min="1024" max="65535" value={config.llamaPort} onChange={(event) => update("llamaPort", Math.min(65535, Math.max(1024, Number(event.target.value) || 1024)))} /></label>

            <label className="settings-field"><span>KV cache K</span><select value={config.cacheTypeK} onChange={(event) => update("cacheTypeK", event.target.value)}>{[...new Set([...llamaCacheTypesK, config.cacheTypeK])].map((type) => <option key={type} value={type}>{type}{type.startsWith("turbo") ? " Â· experimental build" : ""}</option>)}</select></label>

            <label className="settings-field"><span>KV cache V</span><select value={config.cacheTypeV} onChange={(event) => update("cacheTypeV", event.target.value)}>{[...new Set([...llamaCacheTypesV, config.cacheTypeV])].map((type) => <option key={type} value={type}>{type}{type.startsWith("turbo") ? " Â· experimental build" : ""}</option>)}</select></label>

          </div>

          <div className="llama-runtime-actions">

            <button type="button" className="quiet-action" onClick={() => void detectLlamaCacheTypes()} disabled={llamaBusy}><RefreshCw size={14} /> Detect cache formats</button>

            {llamaRunning

              ? <button type="button" className="secondary-button" onClick={() => void stopLlamaServer()} disabled={llamaBusy}><Square size={13} /> Stop server</button>

              : <button type="button" className="secondary-button" onClick={() => void startLlamaServer()} disabled={llamaBusy || !config.llamaServerPath || !config.llamaModelPath || !config.model}><Play size={13} /> Start llama.cpp</button>}

            <span className={`llama-runtime-state ${llamaRunning ? "running" : ""}`}>{llamaRunning ? "Server running" : "Server stopped"}</span>

          </div>

          {llamaStatus && <p className={llamaStatus.includes("started") || llamaStatus.includes("Detected") || llamaStatus.includes("stopped") ? "settings-success" : "inline-error"} role="status">{llamaStatus}</p>}

          <p className="llama-cache-help">Q4 cache can substantially reduce KV memory for long contexts, with backend/model compatibility and output quality varying. TurboQuant formats appear only when this server build advertises them; they are experimental.</p>

        </div>

      )}



      <div className="settings-options-row">

        <label className="settings-switch-field">

          <input

            type="checkbox"

            checked={config.visionEnabled}

            onChange={(event) => update("visionEnabled", event.target.checked)}

          />

          <span className="settings-switch" aria-hidden="true" />

          <span><strong>Vision input</strong><small>{role === "architect" ? "Include screenshots when the model supports them" : "Allow images in Executor requests"}</small></span>

        </label>

        <label className="settings-temperature-field">

          <span>Temperature <strong>{config.temperature.toFixed(2)}</strong></span>

          <input

            type="range"

            min="0"

            max="2"

            step="0.05"

            value={config.temperature}

            onChange={(event) => update("temperature", Number(event.target.value))}

          />

        </label>

      </div>



      {config.provider !== "llamacpp" && <label className="settings-field settings-context-field"><span>Context length {config.contextMode === "auto" ? "Â· Automatic" : "Â· Manual"}</span><input type="number" min="128" max="2000000" step="1024" value={config.contextLength} disabled={config.contextMode === "auto"} onChange={(event) => onChange({ ...config, contextMode: "manual", contextLength: Math.max(128, Number(event.target.value) || 128) })} /><small>Change Auto or Manual in Models &amp; Hardware. Ollama receives its selected limit per request; cloud models use their advertised context.</small></label>}



      {usesSecret && (

        <div className="settings-secret-section">

          <div className="settings-secret-heading">

            <span><KeyRound size={14} /> API key</span>

            {secretExists === true && <span className="settings-secret-status"><Check size={13} /> Saved for {title}</span>}

            {secretExists === false && <span className="settings-secret-status missing">No key saved</span>}

            {secretExists === null && !secretError && <span className="settings-secret-status">Checkingâ€¦</span>}

          </div>

          <div className="settings-secret-controls">

            <div className="settings-secret-input-wrap">

              <input

                type={showSecret ? "text" : "password"}

                value={secret}

                onChange={(event) => { setSecret(event.target.value); setSecretMessage(null); }}

                placeholder={secretExists ? "Replace saved API key" : "Enter API key"}

                aria-label={`${title} ${PROVIDER_LABELS[config.provider]} API key`}

                autoComplete="off"

                spellCheck={false}

              />

              <button type="button" aria-label={showSecret ? "Hide API key" : "Show API key"} onClick={() => setShowSecret((shown) => !shown)}>

                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}

              </button>

            </div>

            <button type="button" className="secondary-button" onClick={() => void saveSecret()} disabled={secretBusy || !secret.trim()}>

              {secretBusy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Save key

            </button>

            {secretExists && <button type="button" className="settings-icon-button" aria-label={`Remove ${title} API key`} title="Remove saved API key" onClick={() => void removeSecret()} disabled={secretBusy}><Trash2 size={15} /></button>}

          </div>

          {secretError && <p className="inline-error" role="alert">{secretError}</p>}

          {secretMessage && <p className="settings-success" role="status">{secretMessage}</p>}

        </div>

      )}

    </section>

  );

}



function validateSettings(settings: ProviderSettingsValue): string | null {

  for (const role of ["architect", "executor"] as const) {

    if (role === "executor" && settings.executorMode === "handoff") continue;

    const config = settings[role];

    try {

      const url = new URL(config.baseUrl.trim());

      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();

    } catch {

      return `Enter a valid HTTP or HTTPS base URL for the ${role === "architect" ? "Architect" : "Executor"}.`;

    }

    if (!Number.isFinite(config.contextLength) || config.contextLength < 128 || config.contextLength > 2_000_000) {

      return `Context length for the ${role === "architect" ? "Architect" : "Executor"} must be between 128 and 2,000,000 tokens.`;

    }

    if (config.provider === "llamacpp" && (config.llamaPort < 1024 || config.llamaPort > 65535)) {

      return `Choose a local server port between 1024 and 65535 for the ${role === "architect" ? "Architect" : "Executor"}.`;

    }

  }

  if (!settings.globalShortcut.trim()) return "Enter a global shortcut, such as Alt+Space.";

  return null;

}



export function ProviderSettings({ settings, theme, monitorResources, backgroundScene, backgroundIntensity, backgroundMotion, onSave, onClose }: ProviderSettingsProps) {

  const [draft, setDraft] = useState<ProviderSettingsValue>(() => ({

    ...settings,

    architect: { ...settings.architect },

    executor: { ...settings.executor },

  }));

  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const [themeDraft, setThemeDraft] = useState<AppTheme>(theme);

  const [monitorDraft, setMonitorDraft] = useState(monitorResources);
  const [sceneDraft, setSceneDraft] = useState<BackgroundScene>(backgroundScene);
  const [intensityDraft, setIntensityDraft] = useState(backgroundIntensity);
  const [motionDraft, setMotionDraft] = useState<BackgroundMotion>(backgroundMotion);



  useEffect(() => {

    setDraft({ ...settings, architect: { ...settings.architect }, executor: { ...settings.executor } });

    setThemeDraft(theme);

    setMonitorDraft(monitorResources);
    setSceneDraft(backgroundScene);
    setIntensityDraft(backgroundIntensity);
    setMotionDraft(backgroundMotion);

  }, [settings, theme, monitorResources, backgroundScene, backgroundIntensity, backgroundMotion]);



  useEffect(() => {

    document.documentElement.dataset.theme = themeDraft;

    return () => { document.documentElement.dataset.theme = theme; };

  }, [themeDraft, theme]);



  const updateRole = (role: ProviderRole, config: ProviderConfig) => {

    setDraft((current) => ({ ...current, [role]: config }));

    setSaveError(null);

  };



  const save = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    const next: ProviderSettingsValue = {

      ...draft,

      architect: { ...draft.architect, model: draft.architect.model.trim(), baseUrl: draft.architect.baseUrl.trim() },

      executor: { ...draft.executor, model: draft.executor.model.trim(), baseUrl: draft.executor.baseUrl.trim() },

      globalShortcut: draft.globalShortcut.trim(),

    };

    const validationError = validateSettings(next);

    if (validationError) {

      setSaveError(validationError);

      return;

    }

    setSaving(true);

    setSaveError(null);

    let shortcutChanged = false;

    try {

      if (next.globalShortcut !== settings.globalShortcut) {

        await invoke("set_global_shortcut", { shortcut: next.globalShortcut });

        shortcutChanged = true;

      }

      await onSave(next, { theme: themeDraft, monitorResources: monitorDraft, backgroundScene: sceneDraft, backgroundIntensity: intensityDraft, backgroundMotion: motionDraft });

      document.documentElement.dataset.theme = themeDraft;
      onClose();

    } catch (error) {

      if (shortcutChanged) {

        try {

          await invoke("set_global_shortcut", { shortcut: settings.globalShortcut });

        } catch (restoreError) {

          setSaveError(`${errorMessage(error)} The previous shortcut could not be restored: ${errorMessage(restoreError)}`);

          setSaving(false);

          return;

        }

      }

      setSaveError(errorMessage(error));

    } finally {

      setSaving(false);

    }

  };



  return (

    <motion.div className="settings-page" initial={{ opacity: 0, y: 10, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.page}>

      <form noValidate onSubmit={(event) => void save(event)}>

        <div className="settings-page-heading">

          <div>

            <span className="settings-eyebrow">CONFIGURATION</span>

            <h2>Settings</h2>

            <p>Choose color, monitoring, shortcuts, and separate models for planning and execution.</p>

          </div>

          <button type="button" className="settings-icon-button" aria-label="Close provider settings" onClick={() => { document.documentElement.dataset.theme = theme; onClose(); }}><X size={18} /></button>

        </div>



        <div className="settings-provider-grid">

          <ProviderCard role="architect" config={draft.architect} onChange={(config) => updateRole("architect", config)} />

          <ProviderCard role="executor" config={draft.executor} onChange={(config) => updateRole("executor", config)} />

        </div>



        <section className="settings-general-card" aria-label="General and appearance settings">
          <div className="settings-general-field background-studio-field">
            <div><strong>Background Studio</strong><p>Pick the atmosphere behind your workspace. These settings are saved on this device.</p></div>
            <div className="background-scene-grid" role="group" aria-label="Background scene">
              {([['moonlit', 'Moonlit', 'Silver moon'], ['aurora', 'Aurora', 'Polar ribbons'], ['nebula', 'Nebula', 'Clouds of light'], ['meteor', 'Meteor shower', 'Falling stars'], ['eclipse', 'Eclipse', 'Amber corona'], ['quiet', 'Quiet space', 'Soft starfield']] as const).map(([value, label, subtitle]) => <button type="button" key={value} className={`background-scene-card scene-preview-${value} ${sceneDraft === value ? 'active' : ''}`} aria-pressed={sceneDraft === value} onClick={() => setSceneDraft(value)}><span className="background-scene-art" aria-hidden="true" /><strong>{label}</strong><small>{subtitle}</small></button>)}
            </div>
          </div>
          <div className="settings-general-field background-control-row">
            <label className="settings-temperature-field"><span>Ambient intensity <strong>{intensityDraft}%</strong></span><input type="range" min="0" max="100" step="1" value={intensityDraft} onChange={(event) => setIntensityDraft(Number(event.target.value))} /></label>
            <label className="settings-field background-motion-select"><span>Motion</span><select value={motionDraft} onChange={(event) => setMotionDraft(event.target.value as BackgroundMotion)}><option value="system">Follow system preference</option><option value="reduced">Reduced motion</option><option value="still">Still background</option></select></label>
          </div>

          <div className="settings-general-field">

            <div><strong>Color scheme</strong><p>Choose the accent colors and ambient glow for Lunaris.</p></div>

            <div className="settings-segmented settings-themes" role="group" aria-label="Color scheme">

              {([["lunar", "Lunar", "Silver / Obsidian"], ["aurora", "Aurora", "Mint / Deep forest"], ["violet", "Violet", "Lilac / Midnight plum"], ["ember", "Ember", "Amber / Warm charcoal"], ["rose", "Rose Nebula", "Rose / Deep wine"], ["glacier", "Glacier", "Ice / Blue night"], ["cosmos", "Cosmos", "Indigo / Starfield"]] as const).map(([value, label, subtitle]) => <button type="button" key={value} className={themeDraft === value ? "active" : ""} aria-pressed={themeDraft === value} onClick={() => setThemeDraft(value)}><span className={`theme-preview theme-preview-${value}`} aria-hidden="true"><span /><i /></span><strong>{label}</strong><small>{subtitle}</small></button>)}

            </div>

          </div>

          <div className="settings-general-field">

            <div><strong>Live resource monitor</strong><p>Sample system RAM and available GPU memory while Lunaris is visible.</p></div>

            <label className="settings-switch-field"><input type="checkbox" checked={monitorDraft} onChange={(event) => setMonitorDraft(event.target.checked)} /><span className="settings-switch" aria-hidden="true" /><span>{monitorDraft ? "On" : "Off"}</span></label>

          </div>

          <div className="settings-general-field">

            <div><strong>Executor mode</strong><p>Choose how Lunaris hands off the compiled prompt.</p></div>

            <div className="settings-segmented" role="group" aria-label="Executor mode">

              <button type="button" className={draft.executorMode === "handoff" ? "active" : ""} aria-pressed={draft.executorMode === "handoff"} onClick={() => setDraft((current) => ({ ...current, executorMode: "handoff" }))}>Copy to agent</button>

              <button type="button" className={draft.executorMode === "stream" ? "active" : ""} aria-pressed={draft.executorMode === "stream"} onClick={() => setDraft((current) => ({ ...current, executorMode: "stream" }))}>Stream in Lunaris</button>

            </div>

          </div>

          <div className="settings-general-field">

            <div><strong>Global shortcut</strong><p>Bring Lunaris to the foreground from anywhere.</p></div>

            <input

              className="settings-shortcut-input"

              value={draft.globalShortcut}

              onChange={(event) => { setDraft((current) => ({ ...current, globalShortcut: event.target.value })); setSaveError(null); }}

              placeholder="Alt+Space"

              aria-label="Global shortcut"

              spellCheck={false}

            />

          </div>

        </section>



        <div className="settings-footer">

          {saveError && <p className="inline-error" role="alert">{saveError}</p>}

          <div className="settings-footer-actions">

            <button type="button" className="quiet-action" onClick={() => { document.documentElement.dataset.theme = theme; onClose(); }} disabled={saving}>Cancel</button>

            <button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save settings</button>

          </div>

        </div>

      </form>

    </motion.div>

  );

}

