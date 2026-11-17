# Model Center, Live Resources, Context Tuning, and Skill Import Design

## Intent

Help users choose and manage local Architect and Executor models that fit their hardware and task, see live memory pressure before and during work, tune context budgets, and reuse skills they already maintain in other coding tools.

## Goals

- Add a compact, always-visible RAM/VRAM widget that expands into system and per-process details.
- Refresh hardware/resource measurements continuously while Lunaris is open and include the latest available snapshot in Architect and Executor request context.
- Add a Models workspace that detects local hardware, lists installed models, explains capabilities with small icons, estimates model/context VRAM use, recommends Architect and Executor setups, and downloads models through supported local runtimes.
- Add an optional direct `llama-server` runtime with per-role context size and independent K/V cache format settings; keep Ollama and LM Studio available.
- Ask whether the user prefers one balanced vision-and-coding Executor or separate coding and vision specialists; explain the best fit for the detected machine.
- Let the user configure Architect and Executor context lengths, with task- and hardware-aware recommendations and an automatic mode.
- Let the Architect request a more suitable Executor model for a specific task. Show a dismissible approval dialog; download and change settings only after the user accepts, and keep current settings on decline or failure.
- Import Markdown skills from user-selected folders/files associated with Codex/ChatGPT, Claude, Cursor, VS Code, LM Studio, and Freebuff when their content is in a supported Markdown form.
- Use smooth, reduced-motion-aware transitions. The VRAM estimate bar shifts from cool colors to warm colors as estimated usage rises, and shows restrained frost/heat cues near the ends of its range.

## Non-goals

- Do not add multi-agent execution in this pass. The architecture may later route work to multiple agents, but this work only improves single Architect/Executor selection and context.
- Do not infer that an installed model has capabilities solely from a custom display name. Show whether capability labels are detected, catalog-derived, or user-confirmed.
- Do not download, load, unload, or switch a model without an explicit user action. An Architect request is a proposal only.
- Do not promise exact memory attribution on hardware/drivers that do not expose per-process GPU counters. Show unavailable/partial telemetry clearly and continue to display reliable system totals.
- Do not recursively scan application folders without the user selecting a source. Import skill content into Lunaris's existing skill library and retain the source name/path as metadata.

## Product behavior

### Live resource widget

Sample system RAM, available RAM, total/used GPU memory, and process-level usage on a short interval while the app is open. Present a small unobtrusive widget in the workspace shell. Clicking it opens a detail popover with a sorted process list, current Architect/Executor model usage when the runtime reports it, last refresh time, and clear unavailable states. Resource polling pauses when Lunaris is not visible or the user disables monitoring.

Every new Architect or Executor request receives the most recent sample and its timestamp. The widget continues to update while a request streams; a stateless in-flight model response cannot see newer samples until the next request/agent turn. This limitation is shown in product help instead of claiming the model is receiving live data inside one generation.

### Models workspace

Provide separate Architect and Executor recommendations and list installed local models with provider, disk size, runtime state, supported context, and capability indicators for coding, vision, tool use, and reasoning. Distinguish observed capabilities from inferred metadata. The first model runtimes are Ollama and LM Studio local APIs; other configured cloud providers remain available but are not downloaded by Lunaris.

The workspace supports refresh, download with progress/cancel, and explicit apply-to-role actions. Ask the user whether they want a balanced multimodal Executor or separate coding and vision models. Recommendations state assumptions, estimated memory range, and why a model fits the requested workload.

For direct llama.cpp use, let the user select an existing `llama-server` executable and GGUF model file. Start and stop the local server only from an explicit user action. Discover supported K/V cache types from that executable's `--help` output and pass those exact types at server startup. Offer `f16`, `q8_0`, and `q4_0` only when advertised. Show TurboQuant-labelled options only when the selected custom build explicitly advertises a TurboQuant type, mark them experimental, and do not promise lossless quality. Cache/context changes require restarting that role's server.

### VRAM and context budgeting

Show a smoothed estimate against detected GPU memory, including model weights, runtime overhead, and KV/context cache when enough metadata is available. Cache-type selection affects the estimate. Mark estimates as approximate and show a range when architecture/quantization details are incomplete. The bar shifts from icy cyan/blue through violet to warm orange/red as it approaches the budget; decorative frost/heat motion respects reduced-motion settings.

The estimator uses an icy-blue frost overlay at estimated usage of 2 GB or less. At 80% of detected VRAM capacity or above, the bar transitions to a red/orange animated flame state. The bar remains smoothed and honors reduced-motion settings.

Architect and Executor context lengths are independent settings with an Auto option. Auto recommends context based on task type, model limits, model pair, and current memory headroom. Manual values remain in force until the user returns to Auto. Include separate controls in Provider Settings and a concise estimate in the Models workspace.

### Architect model-change request

When the Architect identifies a clearly better installed or downloadable Executor for the current task, it may return a structured recommendation with model ID, rationale, capabilities, and estimate. Lunaris validates that recommendation against a known model/runtime catalog and current hardware before showing a moon-to-glowing-lightbulb dialog. The bulb uses the app's thin silver-cyan linework, translucent obsidian orb, and restrained violet/cyan glow rather than a warm emoji-like illustration. Accepting starts the download if needed and updates only the Executor settings after success. Declining performs a brief lightbulb flicker/out animation, returns to the moon mark, dismisses the request, and retains the current model. Cancel, download failure, or incompatible hardware never changes provider settings.

### Skill import

Allow selecting Markdown files and directories from supported coding-tool skill locations. Detect common `SKILL.md` folders and Markdown prompt/skill files for Codex/ChatGPT, Claude, Cursor, VS Code, LM Studio, and Freebuff. Normalize imported files into Lunaris skill metadata (name, description, trigger terms, full Markdown body), preserve original text, show source and conflicts, and let the user select which skills to import or replace. A generic Markdown import remains available if a tool has no documented skill format or exports a different folder layout.

## Implementation calls

- Use Rust/Tauri commands for platform/resource inspection and local runtime model management; keep React for workspace, status widget, charts/budget bar, and approval flow.
- On Windows, use system APIs/counters rather than shelling out to arbitrary executables for telemetry. Capability data and model downloads come from the selected local runtime APIs where available.
- Use a typed runtime/provider adapter boundary so Ollama, LM Studio, and user-selected direct llama.cpp can be supported without changing Architect/Executor UI contracts.
- Start user-selected llama-server executables only after a click, bind them to loopback, and stop them on explicit stop or Lunaris shutdown.
- Store context preferences, monitoring preference, preferred model balance, and runtime selection in existing Lunaris settings. Keep imported skill bodies in the existing local skill store.
- Model discovery/recommendation and visual estimates must remain usable when a runtime is offline or GPU process telemetry is unavailable.

## Acceptance criteria

- The resource widget updates while the app is open, expands to useful process detail, and states when a driver/runtime cannot provide a value.
- Both model roles receive the latest timestamped resource snapshot for each request.
- The Models workspace supports inventory and downloads for Ollama and LM Studio, shows progress, and never changes provider settings without the user's apply/approval action.
- Direct llama.cpp starts only from an explicit action, is bound to loopback, applies detected K/V cache types at startup, and stops cleanly.
- Recommendations respect user preference for one balanced model versus two specialists and report approximate memory fit.
- The VRAM estimator responds smoothly to selected model and context length, changes visual state near budget limits, and honors reduced motion.
- Architect and Executor have independent Auto/manual context controls that persist across restarts.
- An Architect model recommendation is validated and the approval dialog's accept/decline/failure paths preserve the stated behavior.
- Users can import compatible skills from a selected source folder/file, review conflicts, and retain the original Markdown instructions.
- Existing settings and provider behavior remain compatible; model-management UI stays useful when Ollama/LM Studio is unavailable.

### Model library and Linux packaging update

Add a dedicated Install Models view inside the Lunaris Models workspace. It contains a searchable Ollama starter catalog with approximate download storage and VRAM, capability badges, installed-state actions, live pull progress/cancellation, and an exact model-ID field for any additional Ollama library entry. For OpenAI-compatible custom servers, llama.cpp, OpenRouter, OpenAI, and Anthropic, fetch the provider's exposed model list through the Rust API client; show provider metadata and capability hints, then let users select a model. Hosted providers do not expose local disk or VRAM usage and are labeled provider-managed; custom inference servers manage their own model downloads.

On Linux, collect physical memory and process RSS from `/proc/meminfo` and `ps`, while retaining NVIDIA GPU telemetry where `nvidia-smi` is available. Build Ubuntu 22.04 `.deb` and AppImage artifacts as the compatibility baseline for Pop!_OS, Ubuntu, and Debian.
