# Lunaris Implementation Plan

> **For agentic workers:** Implement this plan inline in the three user-approved batches. The product design is `docs/superpowers/specs/2026-11-16-lunaris-design.md`.

**Goal:** Build the complete Windows-first Tauri v2 Lunaris app described by the approved product design.

**Architecture:** React owns the interface and typed state. Rust owns provider traffic, credentials, durable app data, clipboard, shortcuts, and window controls. Tauri commands form the typed bridge, and Rust emits request-ID-scoped streaming events.

**Tech Stack:** Tauri v2, Rust, reqwest, React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide React.

**Spec:** `docs/superpowers/specs/2026-11-16-lunaris-design.md`

## Global Constraints

- Application identifier: `com.lunaris.app`.
- Build command: `npm run tauri build` after `npm install`.
- Installers: Windows NSIS and MSI.
- Providers: Ollama, OpenRouter, OpenAI, Anthropic, and custom OpenAI-compatible.
- Store provider secrets only in Windows Credential Manager; store preferences, history, and skills under `%APPDATA%/Lunaris/`.
- Never retain image bytes in history by default.
- Ship editable `blender-mcp`, `react-ui`, and `backend-api` skills.
- No placeholder functions or TODO stubs.

## Review Focus

- A malformed or traversal-like storage key cannot escape the Lunaris app-data directory.
- Missing credentials are distinct from invalid credentials and do not expose secrets.
- A canceled or overlapping streaming request cannot append chunks to another request.
- A malformed provider URL or HTTP error produces a recoverable message without exposing authorization headers.
- A shortcut registration conflict leaves window use available.

---

### Task 1: Desktop and backend foundation (Batch 1)

**Files:** root `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `index.html`; `src-tauri/Cargo.toml`, `tauri.conf.json`, `build.rs`, `src/main.rs`, `src/lib.rs`, `src/commands/*.rs`, and `capabilities/default.json`.

**Interfaces:** Exposes `provider_complete`, `provider_stream`, `cancel_provider_request`, `ollama_list_models`, credential, persistence, skill, clipboard, shortcut, and window commands for the frontend batch.

- [ ] Create complete package/build configuration for React/Tauri and Windows NSIS/MSI.
- [ ] Implement Rust provider routing, Ollama discovery, secret storage, app-data persistence, skill CRUD, streaming events/cancellation, and system integration commands.
- [ ] Verify JSON/TOML syntax and run the available frontend/Rust compile checks.

### Task 2: Typed domain, skills, and LLM utilities (Batch 2)

**Files:** `src/types/{architect,provider,skills}.ts`, `src/data/defaultSkills.ts`, `src/lib/{llmRouter,jsonRepair,promptCompiler,storage}.ts`.

**Interfaces:** Calls the Task 1 Tauri commands; exports validated provider requests, repairable Architect parsing, skill-aware prompt compilation, and typed persistence.

- [ ] Define the Architect, provider, skill, and persistence contracts.
- [ ] Supply complete built-in Markdown skills and first-run seeding data.
- [ ] Implement provider routing, robust JSON extraction/repair, prompt compilation, and storage wrappers.
- [ ] Run TypeScript compilation after the UI batch is available.

### Task 3: Interaction and Lunar Studio UI (Batch 3)

**Files:** `src/main.tsx`, `src/App.tsx`, `src/styles/globals.css`, `src/hooks/*`, `src/components/layout/*`, `src/components/forge/*`, `src/components/modals/*`, and `src/components/ui/*`.

**Interfaces:** Consumes Task 2 domain and service APIs; calls the Task 1 system integrations through typed Tauri wrappers.

- [ ] Implement provider/model settings, Ollama discovery, the recursive clarification state machine, history, and skill management.
- [ ] Implement screenshot paste/drop, accessible animated question cards, compiled blueprint view, streaming output, and copy handoff.
- [ ] Apply the approved Lunar Studio theme and frameless native controls.
- [ ] Run TypeScript and production build checks; report native installer status based on available toolchains.
