# Model Center, Resources, Context, and Skill Import Implementation Plan

> **For agentic workers:** Use the executing-plans workflow and complete tasks in order.

**Goal:** Add live hardware awareness, local model selection/downloads, role-specific context budgets, Architect model-change approval, and skill import without adding multi-agent execution.

**Architecture:** Rust commands own platform resource sampling and local runtime operations. Typed provider adapters expose model inventory and local downloads to a React Models workspace; shared settings hold provider/context preferences. Each LLM request gets a timestamped resource snapshot, while a new skill import flow normalizes selected Markdown files into the current local library.

**Tech Stack:** Tauri v2/Rust, reqwest, React 19, TypeScript, Framer Motion, existing settings and skill storage.

**Spec:** `docs/superpowers/specs/2026-11-16-model-center-resource-context-skills-design.md`

## Global Constraints

- No multi-agent execution in this pass.
- No model is downloaded, loaded, unloaded, or selected without an explicit user action.
- Hardware recommendations and VRAM estimates communicate uncertainty and use ranges when metadata is incomplete.
- Resource samples refresh every five seconds while the app is visible; child console tools are hidden on Windows and each stateless model call receives the newest available sample at request start.
- Do not scan app data directories until the user selects a folder or files.
- Retain existing provider, settings, history, and skill compatibility.
- Honor reduced-motion preferences.
- Do not add or run tests; use production frontend and Tauri build verification.

## Review Focus

- Runtime offline, unsupported model metadata, and absent GPU counters remain visible nonfatal states.
- Download cancellation/failure never changes provider selection.
- Concurrent downloads and sampling do not overwrite or leak request progress.
- Low VRAM/headroom and invalid/too-large context values remain bounded and understandable.
- Imported skill naming collisions, malformed frontmatter, and unsupported source layouts preserve the original content and ask for user choice.
- Model API catalogs that lack download/size metadata remain selectable and label memory as provider-managed rather than inventing storage or VRAM figures.

---

### Task 1: Resource and model runtime contracts

**Files:**
- Create: `src/types/systemResources.ts`
- Create: `src/types/modelManager.ts`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/resources.rs`
- Create: `src-tauri/src/commands/models.rs`
- Create: `src-tauri/src/commands/llamacpp.rs`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- `ResourceSnapshot`: sample timestamp, physical memory totals, GPU adapter totals, process rows, active local model rows, and per-field availability/source.
- `ManagedModel`: runtime, exact model ID, disk size, parameters, quantization, family/capability evidence, context limit, and loaded state.
- Tauri commands `resources_snapshot()`, `runtime_models(runtime, baseUrl)`, `runtime_pull(runtime, baseUrl, model, requestId)`, and `runtime_cancel_pull(requestId)`.
- Tauri commands `llama_cache_types(executablePath)`, `llama_server_start(role, executablePath, modelPath, modelName, port, contextLength, cacheTypeK, cacheTypeV)`, `llama_server_stop(role)`, and `llama_server_is_running(role)`.
- Progress event `lunaris://model-download` carries request ID, model ID, status, completed bytes, total bytes, and message.

- [ ] Implement bounded Windows resource sampling for RAM, GPU totals, and per-process usage, returning explicit unavailable fields where the OS/driver cannot report a value.
- [ ] Implement Ollama model inventory, metadata inspection, pull progress, and cancellation through its local API.
- [ ] Implement LM Studio v1 REST inventory/download/progress adapters with optional local authentication kept outside prompts and UI logs.
- [x] Add explicit-start/stop direct llama.cpp server management, bind child servers to loopback, detect cache types from the selected binary's help output, and clean up child processes on app shutdown.
- [x] Register commands/events and confirm `cargo check --release` succeeds.

### Task 2: Live resource widget and request context

**Files:**
- Create: `src/hooks/useSystemResources.ts`
- Create: `src/components/layout/ResourceWidget.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/llmRouter.ts`
- Modify: `src/hooks/useClarificationLoop.ts`
- Modify: `src/types/provider.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/styles/globals.css`

**Interfaces:**
- `useSystemResources(enabled)` samples on a two-second interval while visible and returns the latest `ResourceSnapshot`, stale/error state, and refresh controls.
- `ResourceWidget` accepts the snapshot and monitoring preference; clicking opens process/model detail.
- `ProviderRequestOptions.resourceSnapshot?: ResourceSnapshot` supplies timestamped prompt context.
- `ProviderSettings.monitorResources: boolean` defaults to `true` when absent in old settings.

- [ ] Add persisted monitoring preference and a live shell widget with expandable process details and unavailable-data states.
- [ ] Inject the latest timestamped snapshot into Architect and Executor request context without storing history of telemetry.
- [ ] Pause sampling when hidden/disabled and resume with a fresh sample when visible.
- [ ] Confirm `npm run build` succeeds.

### Task 3: Models workspace and VRAM/context budget

**Files:**
- Modify: `src/types/provider.ts`
- Modify: `src/types/modelManager.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/components/models/ModelCenter.tsx`
- Create: `src/components/models/ModelCard.tsx`
- Create: `src/components/models/VramBudgetBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/modals/ProviderSettings.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Add navigation page `models`.
- `ProviderConfig.contextLength: number | "auto"` is persisted independently for Architect and Executor and is optional on legacy settings load.
- `ProviderConfig` carries optional direct llama.cpp executable/model paths, role-local port, and K/V cache type strings. Direct runtime requests use the OpenAI-compatible local endpoint; Ollama requests receive `num_ctx` in their options.
- `ModelCenter` accepts current role configs, resource snapshot, runtime adapters, and an `onApply(role, config)` callback.
- Recommendation function consumes task category, role, hardware, available models, and user preference (`balanced` or `specialists`) and returns ranked model IDs with evidence and estimated memory ranges.
- VRAM estimator returns `{ minBytes, expectedBytes, maxBytes, confidence, components }` for a selected model/context pair.

- [ ] Display installed model inventory, detected capability evidence, runtime state, and explicit refresh/download/apply controls.
- [ ] Add one-balanced-model versus coding-and-vision-specialists preference, ranked recommendations, and explainable hardware fit.
- [ ] Add model/context VRAM estimate and smoothed cool-to-warm budget bar with accessible text and reduced-motion behavior.
- [ ] Add independent Auto/manual Architect and Executor context controls and pass effective context to providers.
- [x] Add direct llama.cpp settings for server path/model file/context/port and separate cache K/V types. Discover formats from the chosen server and show TurboQuant only when that binary advertises it.
- [x] Confirm `npm run build` succeeds.

### Task 4: Architect model recommendation request

**Files:**
- Modify: `src/types/architect.ts`
- Modify: `src/lib/jsonRepair.ts`
- Modify: `src/hooks/useClarificationLoop.ts`
- Modify: `src/App.tsx`
- Create: `src/components/models/ModelChangeRequest.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Optional structured `executor_recommendation` contains exact runtime/model ID, task-relevance rationale, required capabilities, and context estimate.
- Recommendations are validated against current inventory/catalog and available hardware before UI presentation.
- Accept triggers download if required and applies new Executor config only after success; decline/cancel/failure preserves current settings.

- [ ] Ask the Architect for a replacement model only when current Executor capability or memory fit is materially inadequate.
- [ ] Add animated moon/lightbulb approval dialog and distinct accept/decline/cancel/failure states.
- [ ] Add download progress and apply new settings only after successful completion and explicit acceptance.
- [ ] Confirm `npm run build` succeeds.

### Task 5: Import skills from selected app folders

**Files:**
- Modify: `src/components/modals/SkillManager.tsx`
- Modify: `src/types/skills.ts`
- Modify: `src/lib/storage.ts`
- Create: `src/lib/skillImport.ts`
- Modify: `src/styles/globals.css`

**Interfaces:**
- `parseImportedSkills(files: File[])` recognizes `SKILL.md` and compatible Markdown prompts, extracting frontmatter when present and preserving the full source body.
- Import preview displays detected source, normalized name/description/triggers, duplicate conflicts, and per-item import/replace choice.
- Imported skills are written through the existing secure skills store; no automatic recursive scanning occurs.

- [ ] Add file and folder selection plus generic Markdown import and common Codex/Claude/Cursor/VS Code/LM Studio/Freebuff folder recognition.
- [ ] Parse optional metadata conservatively, preserve original Markdown, and expose duplicate/unsupported-file choices before saving.
- [ ] Confirm `npm run build` succeeds.

### Task 6: Integrated verification and executable

**Files:**
- Verify: all files above.

- [x] Run `npm run build` and confirm TypeScript/Vite production output succeeds.
- [x] Run `cargo check --release` from `src-tauri` and confirm the Rust backend remains valid.
- [x] Run `npm run tauri build -- --no-bundle` and report the Windows executable path.
- [ ] Confirm existing settings without new preferences still load through defaults.

### Task 7: VRAM states and provider-aware model library

**Files:**
- Modify: `src/components/models/ModelCenter.tsx`
- Modify: `src/data/modelCatalog.ts`
- Modify: `src/types/provider.ts`
- Modify: `src/styles/globals.css`
- Modify: `src-tauri/src/commands/provider.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- `provider_list_models(role, provider, baseUrl?) -> CompatibleModel[]` uses the configured provider's GET `/models` endpoint and secure role-specific credentials.
- `CompatibleModel` returns ID, optional name/description/context, image input modalities, and supported parameter names.
- `ModelCenter` has separate Overview and Install Models views; Ollama downloads use the existing progress/cancel command; hosted/server models are selectable and disclose that the provider manages model storage.

- [x] Add the separate searchable model browser, Ollama starter library and exact-ID downloader, provider API discovery, storage/VRAM labels, capability icons, and model selection.
- [x] Transition the VRAM bar to frost at ≤2 GB and animated fire at ≥80% of detected capacity, with reduced-motion support.
- [ ] Build the frontend and run Rust release checks on Windows and Linux.

### Task 8: WSL Linux build and Pop!_OS artifacts

**Files:**
- Modify: `src-tauri/src/commands/system.rs`
- Verify: `src-tauri/tauri.linux.conf.json`, `.github/workflows/build-installers.yml`, and `docs/packaging.md`.

**Interfaces:**
- Linux memory uses `/proc/meminfo`; process RSS uses `ps`; NVIDIA telemetry remains optional.
- Build Ubuntu 22.04 `.deb` and AppImage artifacts for Pop!_OS, Ubuntu, and Debian.

- [x] Install Ubuntu 22.04 WSL, Tauri Linux prerequisites, Node.js 22, and Rust stable.
- [x] Add Linux RAM/process resource sampling.
- [ ] Build, inspect, and copy the Linux installer artifacts into the workspace.
- [ ] Rebuild the Windows executable and create the available Windows installer artifacts.
