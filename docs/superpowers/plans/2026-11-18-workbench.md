# Lunaris Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staged Design Studio, Executor follow-up and blueprint revision history, reusable workflow presets, explicit tool health checks, and credential-free backup/restore.

**Architecture:** Extend the Architect contract and prompt sessions with bounded workflow state. Add focused React components for Studio, revision review, health status, preset editing, and backup import/export. Reuse existing Tauri settings/history/storage and Rust HTTP client; keep actual project execution under the configured Executor and user.

**Tech Stack:** React 19, TypeScript, Vite, Framer Motion, Tauri v2, Rust, reqwest, serde_json.

**Spec:** `docs/superpowers/specs/2026-11-18-workbench-design.md`

## Global Constraints

- Do not execute user-configured binaries or run arbitrary shell commands.
- Only label a stage verified after an explicit user action.
- Keep credentials and image bytes out of backup files.
- Bound history revisions and chat retention.
- Keep existing persisted settings and prompt sessions backward-compatible.
- Add no new runtime dependency.

## Review Focus

- Older sessions without stages, transcript, revisions, or workflow presets load with safe defaults.
- Malformed Architect stage JSON falls back to a valid software-workflow plan.
- Stage copy/run includes the current phase and stops later phases from being executed prematurely.
- A remote Executor claim never marks a stage verified automatically.
- Failed restore validation leaves existing data untouched.
- URL health checks time out and report status without executing an MCP tool.

---

### Task 1: Workflow contract and persistence

**Files:** `src/types/architect.ts`, `src/types/provider.ts`, `src/lib/jsonRepair.ts`, `src/hooks/useClarificationLoop.ts`, `src/lib/promptCompiler.ts`, `src/lib/storage.ts`, `src/App.tsx`

**Interfaces:**
- Produce optional `workflow_stages` in `ArchitectResult`, typed `WorkflowStage`, per-stage status and evidence in `PromptSession`, and bounded transcript/revision types.
- Produce a stage prompt compiler accepting blueprint, stage, prior stage summaries, and follow-up history.

- [ ] Add types and JSON normalization for 3–8 stages with bounded title, goal, deliverable, and verification strings; malformed values become an empty array.
- [ ] Update the Architect system prompt to emit staged software plans when the user is designing an application, with a minimum first draft, explicit verification, feature expansion, and polish. Require later stages to remain pending.
- [ ] Add backward-compatible settings/history normalization for workflow state, chat, revisions, and presets.
- [ ] Add stage-scoped execution prompt compilation and compile successful TypeScript changes through `npm run build`.

### Task 2: Design Studio stages and Executor follow-up

**Files:** `src/components/studio/DesignStudio.tsx`, `src/components/studio/ExecutorConversation.tsx`, `src/components/layout/Sidebar.tsx`, `src/App.tsx`, `src/lib/llmRouter.ts`, `src/styles/globals.css`

**Interfaces:**
- Consume normalized `WorkflowStage` and `PromptSession` fields from Task 1.
- Produce UI callbacks for stage selection, run/copy, status changes, follow-up send, and append-to-blueprint revision.

- [ ] Add a Design Studio navigation section with a progress header, stage cards, deliverables, test expectations, and evidence field.
- [ ] Add Run Stage and Copy Stage Prompt actions. Run uses the current Executor route; Copy uses native clipboard handoff. Both include instructions to stop after the selected stage.
- [ ] Add explicit `Mark verified` and `Needs changes` controls; neither Executor output nor test wording can change status without user action.
- [ ] Add a bounded follow-up conversation tied to the active session and stage; preserve transcript in session history.
- [ ] Add an action to turn accepted follow-up feedback into a new blueprint revision.
- [ ] Build and inspect all action/error/empty states.

### Task 3: Blueprint version history and restore

**Files:** `src/components/studio/RevisionHistory.tsx`, `src/lib/blueprintVersions.ts`, `src/App.tsx`, `src/styles/globals.css`

**Interfaces:** Consume and produce `PromptSession.blueprintRevisions` from Task 1.

- [ ] Snapshot the active blueprint before approved edits, cap retained revisions, and record timestamp plus reason.
- [ ] Show revisions with a line-based side-by-side comparison and restore action.
- [ ] On restore, snapshot the current version first and keep stage progress unless user explicitly resets it.
- [ ] Build and inspect revision and restore states.

### Task 4: Workflow presets

**Files:** `src/data/promptTemplates.ts`, `src/lib/storage.ts`, `src/components/forge/PromptInput.tsx`, `src/components/modals/WorkflowPresetEditor.tsx`, `src/App.tsx`, `src/styles/globals.css`

**Interfaces:** Preset stores prompt template fields plus stable selected skill/tool IDs.

- [ ] Add persistent create/edit/delete preset records with selected existing skills and registered apps/MCP tools.
- [ ] When chosen, seed the prompt and provide selected skill/tool IDs to Architect as preferred workflow context; retain normal relevance checks and never fabricate missing IDs.
- [ ] Add visible badges for missing IDs after edits/imports and allow user to repair them.
- [ ] Build and inspect gallery, editor, and selection states.

### Task 5: Tool health checks

**Files:** `src-tauri/src/commands/tool_health.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src/components/modals/ToolLibrary.tsx`, `src/styles/globals.css`

**Interfaces:** Tauri `check_tool_health` returns a typed status, detail, and checked-at timestamp.

- [ ] Check local application paths and stdio command path existence without launching configured applications or servers.
- [ ] Check URL MCP endpoint reachability through Rust with a short timeout and response status; do not call MCP methods.
- [ ] Add per-entry Check controls, progress state, last-checked status, and recoverable errors.
- [ ] Run `cargo check` and frontend build.

### Task 6: Local backup and restore

**Files:** `src/types/backup.ts`, `src/lib/backup.ts`, `src/components/modals/BackupManager.tsx`, `src/App.tsx`, `src/lib/storage.ts`, `src/styles/globals.css`

**Interfaces:** Versioned backup envelope contains sanitized settings, prompt history, memory, custom skills, and workflow presets.

- [ ] Export a JSON backup without provider credentials, screenshot bytes, or temporary handoff files.
- [ ] Validate version, counts, and field limits before showing an import preview.
- [ ] Merge matching IDs with an explicit confirmation, save collections, and preserve current keyring credentials.
- [ ] On any validation or write failure, preserve the last persisted collections and show the failing collection.
- [ ] Build and inspect import/export states.

### Task 7: Final verification and repository update

**Files:** All changed files in Tasks 1–6.

- [ ] Review the complete diff, confirm no generated credentials or temporary files are included, and run `git diff --check`.
- [ ] Run `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`.
- [ ] Sync source to the main `F:\Lunaris` workspace, commit the intended files, and push the authorized update to `Siegeisok67/lunaris`.
