# Lunaris Product Design

## Intent

Lunaris is a native Windows desktop prompt middleware app that helps a user turn an underspecified coding or creative request into a complete, actionable execution prompt. The user enters a rough prompt, optionally adds screenshots, answers a small adaptive set of questions, and receives a compiled plan with relevant skills and tool rules. They can then copy the plan to an IDE agent or ask a configured executor model to carry it out in Lunaris.

## Why

Users working across coding agents and creative tools often lose time clarifying their own intent, remembering tool-specific constraints, and repeating implementation instructions. Lunaris should make those requirements explicit once, keep the clarification lightweight, and package the result for the user's chosen execution path.

## Goals

- Ship a Windows desktop app using Tauri v2, React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, and Lucide React.
- Support independent Architect and Executor provider/model settings for Ollama, OpenRouter, OpenAI, Anthropic, and custom OpenAI-compatible endpoints.
- Discover Ollama models and route screenshots to a vision-capable Architect model when configured.
- Run a recursive clarification loop that produces structured known specs, matching skills, and an execution-ready prompt; allow the user to skip remaining questions and compile.
- Store editable Markdown skill rules locally and inject only the rules selected by the Architect into the compiled prompt.
- Offer executor streaming and IDE handoff through clipboard copy, with a polished dark, frameless desktop interface and global shortcut.
- Keep provider credentials out of frontend browser storage and persist app state under the user's Windows application data directory.
- Provide a complete, buildable source project in the requested module layout, without placeholder functions or TODO stubs.

## Non-goals

- Lunaris will not control or automate IDEs through undocumented UI hooks. IDE Handoff Mode prepares and copies the prompt; auto-paste is excluded from the initial scope because it can send content to the wrong foreground app.
- Lunaris will not execute shell commands, modify a target project, or claim to have changed external files. The Executor role generates a response; the configured execution agent remains responsible for project changes.
- This initial release will target Windows packaging. Other operating systems may remain buildable with Tauri but are not release targets.
- The initial release will not synchronize settings or skills across devices.

## User flow

1. The user opens Lunaris or invokes its registered global shortcut.
2. They enter a natural-language request and optionally attach image files by paste or drag-and-drop.
3. The Architect evaluates the request, the conversation so far, available skills, and supported image inputs. It returns known specs, detected skill IDs, readiness, and any next questions as structured JSON.
4. The user answers choice or custom-text questions. Lunaris repeats the Architect turn until ready, or the user chooses “Skip & Compile Now.”
5. Lunaris compiles known specs, selected Markdown skills, and the final execution plan into one master prompt.
6. The user copies the prompt for an IDE agent or streams a response from the configured Executor model. The app retains the session in prompt history.

## Product behavior and constraints

### Providers and routing

- Provider configuration is stored independently for Architect and Executor roles, including provider kind, endpoint, model, and role-specific options.
- Ollama discovery uses `GET /api/tags` against the configured local base URL. Refresh failures are shown in the relevant settings view without discarding the last known selection.
- Ollama generation uses the Ollama API. OpenAI and OpenRouter use their chat-completions-compatible API; Anthropic uses its Messages API; custom endpoints use the OpenAI-compatible contract.
- All network requests are made by Rust commands using `reqwest`, with credentials passed only from backend-managed storage.
- The Architect consumes structured JSON and the Executor can stream incremental output to the UI. Provider errors, timeouts, malformed responses, and cancellation surface as recoverable UI states.
- Image attachments are held in the current session, encoded for providers that accept image input, and omitted from provider requests that do not support vision. The UI clearly indicates when the selected Architect cannot use attached images.
- API secrets are held in the Windows credential manager through the Rust `keyring` crate. Non-secret provider preferences and conversation history are persisted in the app's local app-data directory. Skill Markdown files live under `$APPDATA/Lunaris/skills/`.

### Clarification and compilation

- The Architect response contract contains `known_specs`, `detected_skills`, `is_ready_to_execute`, `next_questions`, and `final_execution_prompt`.
- Each question has a stable ID, question text, optional quick choices, and supports a custom answer.
- Responses are parsed through a fault-tolerant JSON repair layer, then validated against the application schema. Repair attempts are bounded; irrecoverable output produces an actionable retry state rather than crashing the UI.
- The UI displays accumulated known specs and active skill badges during clarification. It does not expose skill Markdown in the question cards.
- “Skip & Compile Now” asks the Architect for a final plan using the known specs and unanswered items as reasonable defaults. The compiled result labels assumptions so the user can review them.
- Skill matching is constrained to installed skill IDs. Missing or invalid IDs are ignored with a visible status, and the final compiler includes only the corresponding local skill content.
- Token savings are an estimate based on the rough prompt and compiled plan lengths, not a provider billing measurement.

### Desktop shell and presentation

- Use a frameless Tauri v2 main window with a custom titlebar, resize behavior, and minimize, maximize/restore, and close controls.
- Register a configurable global shortcut, defaulting to `Alt+Space`; registration conflicts are displayed and the app remains usable from its window.
- Use Tauri clipboard support for copy and paste integration. Paste image support reads clipboard image data through a native command and enforces a reasonable image size limit.
- UI follows the supplied Lunar Studio palette: `#09090B` background, `#121216` elevated surfaces, subtle white borders, and cyan/violet accents. Framer Motion animates transitions between input, clarification, and blueprint states.
- Prompt history, Skill Library, and Provider Settings are accessible from the sidebar. Provider and skill management are editable dialogs/views.
- Core workflows remain usable without network access; offline behavior includes history, skill management, provider configuration, and clear errors for model actions.

## Architecture

- React owns presentation, local interaction state, and typed Tauri command invocation.
- Rust owns provider networking and streaming, secure secret access, app-data persistence, clipboard/image access, global shortcut registration, and window integration.
- Shared TypeScript types define provider configuration, Architect response/question state, skill metadata, session/history records, and command payloads.
- `llmRouter.ts` chooses the provider adapter and normalizes responses; `jsonRepair.ts` extracts/repairs bounded malformed JSON; `promptCompiler.ts` creates the final handoff prompt; `storage.ts` wraps typed persistence commands.
- The requested directory layout is the baseline. Additional focused files may be added for provider adapters, validation, command contracts, and shared UI as needed to keep modules cohesive.

## Constraints

- Desktop shell and backend: Tauri v2 and Rust.
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, and Lucide React.
- Build command: `npm run tauri build` after `npm install`.
- Application identifier: `com.lunaris.app`.
- Installer target: Windows NSIS and MSI bundles where the build host supports them.
- Required provider families: Ollama, OpenRouter, OpenAI, Anthropic, and custom OpenAI-compatible.
- Required shipped skill examples: `blender-mcp`, `react-ui`, and `backend-api`.
- No credential is stored in frontend local storage, cookies, or plaintext app preferences.

## Defaults left to implementation

- Use the Windows credential manager for API secrets, and Tauri app-data JSON files for settings, history, and skills.
- Implement backend streaming as Tauri events with request IDs and explicit cancellation commands so UI state can be correlated across simultaneous requests.
- Include editable starter skill Markdown files seeded on first run, then preserve user edits on later launches.
- Keep “auto-paste” out of scope; provide one-click copy and an optional foreground-window hint for the user to paste themselves.
- Set conservative request and image size limits, expose them as clear errors, and avoid retaining attached image bytes in history by default.
- Use the requested role split and support direct Executor streaming, but make copy-to-agent the default completion action.

## Acceptance outcomes

- A Windows developer can install dependencies and build a Tauri v2 Windows installer from the project.
- On launch, the app presents a coherent frameless Lunar Studio interface and can open from its global shortcut.
- The user can configure distinct Architect and Executor providers, save credentials securely, and refresh Ollama models.
- A prompt can pass through multiple question turns, accept custom answers, skip to compilation, and produce a prompt containing only the matching installed skill rules.
- Image attachments are accepted and routed only to a provider/model configured for vision.
- The user can copy a compiled prompt or view a streamed Executor response, and can revisit prior text sessions.
- Invalid model JSON, provider errors, shortcut conflicts, absent credentials, and missing local skills produce recoverable, understandable states.
