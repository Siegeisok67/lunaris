# Lunaris Permanent Memory Implementation Plan

> **For agentic workers:** Native execution in this session; tasks use checkbox syntax for tracking.

**Goal:** Add editable, local Profile and Project memory that users can explicitly include in Architect and Executor context.

**Architecture:** Store a versioned memory collection through the existing Tauri storage API. Add a dedicated Memory page for projects and entries, then pass a bounded, labeled context string from the prompt composer through every clarification request, blueprint, stream, and session restore path.

**Tech Stack:** Tauri v2 storage commands, React 19, TypeScript, existing clarification hook and prompt compiler.

**Spec:** `docs/superpowers/specs/2026-11-17-permanent-memory-design.md`

## Global Constraints
- Memory remains on this device and under explicit user control.
- Only enabled Profile entries and the selected Project's enabled entries enter model context.
- Current user instructions override saved context.
- Saved answers require an explicit user action.
- Limit storage to 80 entries, 20 projects, and 12,000 included characters.
- Existing sessions remain readable without project metadata.

## Review Focus
- Empty memory and unknown project IDs behave as no memory.
- Disabled entries and unrelated project entries never reach providers.
- Deleted projects cannot remain selected in active or restored sessions.
- Duplicate answer suggestions are recognized without saving automatically.
- Provider retries and every clarification turn receive identical current memory context.

---

### Task 1: Memory Data and Context Builder

**Files:** create `src/types/memory.ts`, `src/lib/memory.ts`; modify `src/lib/storage.ts`, `src/types/architect.ts`, `src-tauri/src/commands/storage.rs`.

- [x] Define Profile/Project entries, project records, collection defaults, bounds, and safe legacy loading.
- [x] Add persistent load/save wrappers and a deterministic memory-context builder with project scoping, enable filters, character cap, and duplicate detection.
- [x] Add optional `projectId` to saved prompt sessions.

### Task 2: Memory Workspace

**Files:** create `src/components/memory/MemoryManager.tsx`; modify `src/components/layout/Sidebar.tsx`, `src/App.tsx`, `src/styles/globals.css`.

- [x] Add navigation to Memory.
- [x] Build project CRUD and searchable memory entry CRUD with scope, enabled state, edit, and explicit delete.
- [x] Show an empty state, memory count/cap, and clear local-only / do-not-add-secrets guidance.

### Task 3: Prompt and Provider Integration

**Files:** modify `src/components/forge/PromptInput.tsx`, `src/hooks/useClarificationLoop.ts`, `src/lib/promptCompiler.ts`, `src/App.tsx`.

- [x] Add project selection and Include saved memory controls to prompt input.
- [x] Pass the bounded memory context to every Architect start, answer, retry, and skip request.
- [x] Include labeled memory in the compiled blueprint and streamed Executor request.
- [x] Persist and restore the selected project with prompt history; fall back safely if a project is removed.

### Task 4: Approval-Based Answer Suggestions and Verification

**Files:** modify `src/components/forge/BlueprintViewer.tsx`, `src/App.tsx`, `src/styles/globals.css`; sync `repo-sync/`.

- [x] Show answered clarification facts as individual pending memory suggestions.
- [x] Save only after explicit acceptance, with Profile or selected Project scope, and avoid duplicates.
- [x] Run `npm run build`, inspect `git diff --check`, sync the code and design docs, and push the authorized repository update.
