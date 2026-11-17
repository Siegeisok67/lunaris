# Tool Catalog, Clarification, and Motion Implementation Plan

> **For agentic workers:** Use the executing-plans workflow and complete the tasks in order.

**Goal:** Persist local application and MCP catalogs, use relevant tools and skills in execution prompts, stop repeated clarification questions, and make interface transitions smooth.

**Architecture:** Store catalogs in the existing local settings JSON, pass concise catalogs to the Architect, and validate its selected IDs before compiling exact app/MCP/skill directives. Keep MCP connections in the Executor, not Lunaris. Add deterministic answer-aware question filtering and shared Framer Motion presets.

**Tech Stack:** React 19, TypeScript, Tauri v2, Rust, Framer Motion, existing JSON persistence.

**Spec:** `docs/superpowers/specs/2026-11-16-tools-skills-clarification-motion-design.md`

## Global Constraints

- Local apps and MCP entries are prompt metadata; Lunaris does not launch apps or connect to MCP servers.
- MCP credentials and secret environment values are not stored in the catalog.
- The Executor prompt uses exact registered MCP tool names and validated IDs.
- Selected skill IDs are explicitly invoked in provider-neutral language and their complete Markdown is included.
- Old settings files and history records without new fields continue to load.
- Respect `prefers-reduced-motion` throughout the interface.
- Do not add a separate test suite; verify through production TypeScript and Tauri builds.

## Review Focus

- Empty or stale tool catalogs: no fabricated app or MCP calls appear in the blueprint.
- Paths and tool names containing spaces or punctuation: they remain intact as prompt data and are never executed by Lunaris.
- Architect returns unknown or duplicate IDs: compiler includes only unique catalog-backed selections.
- Answered question is repeated with a new ID or close paraphrase: filter it without suppressing unrelated questions.
- Reduced-motion preference: transitions remove or reduce translation, scale, and stagger.

---

### Task 1: Define and persist tool catalogs

**Files:**
- Create: `src/types/tools.ts`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- `LocalApplication`: `{ id, name, executablePath, description, triggers, usageNotes, enabled }`
- `McpServer`: `{ id, name, connectionKind, commandOrUrl, args, description, triggers, usageNotes, tools, enabled }`
- `McpTool`: `{ id, name, description, usageNotes, triggers }`
- `ToolCatalog`: `{ applications: LocalApplication[], mcpServers: McpServer[] }`
- Settings load returns an empty `ToolCatalog` when old settings omit it.

- [x] Define catalog types with stable string IDs and no secret-valued fields.
- [x] Add `toolCatalog` to persisted settings and merge missing legacy fields with empty arrays.
- [x] Confirm `npm run build` succeeds with the new settings shape.

### Task 2: Add the persistent Tools workspace

**Files:**
- Create: `src/components/modals/ToolLibrary.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Tool workspace accepts `ToolCatalog` and `onSave(ToolCatalog)`.
- Navigation adds a `tools` page; the workspace has separate Local Applications and MCP Servers views.
- App records expose name, executable path, purpose, trigger terms, and Executor usage notes.
- MCP records expose server name, command or URL, arguments, purpose, and nested exact tool names/descriptions/usage notes.

- [x] Add create, edit, enable/disable, and delete flows for application and MCP records.
- [x] Persist each edit through existing `saveSettings`; do not execute stored paths or commands.
- [x] Add clear empty states and validation for required names/locations and unique IDs.
- [x] Confirm `npm run build` succeeds and old settings still load through their defaults.

### Task 3: Route relevant tools and callable skills into the blueprint

**Files:**
- Modify: `src/types/architect.ts`
- Modify: `src/lib/jsonRepair.ts`
- Modify: `src/hooks/useClarificationLoop.ts`
- Modify: `src/lib/promptCompiler.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- `ArchitectResult.detected_tools?: string[]` contains catalog IDs only.
- Clarification start/answer/retry/skip receive the current `ToolCatalog`.
- Compiler receives the catalog and emits selected Local Applications, Available MCP Calls, and Matched Skills sections.

- [x] Include enabled app and MCP summaries in the Architect context, including exact MCP tool names.
- [x] Include bounded skill Markdown guidance with skill ID, name, purpose, triggers, and concise content excerpts.
- [x] Parse `detected_tools` fault-tolerantly and cap/deduplicate returned IDs.
- [x] Filter selections against enabled catalog IDs; omit unknown IDs and duplicate entries.
- [x] Add an explicit “Invoke skill `<id>` before its relevant work” directive and include the selected skill's complete Markdown as fallback rules.
- [x] Confirm `npm run build` succeeds and prompt compilation remains valid when the catalog is empty.

### Task 4: Prevent repeated clarification questions

**Files:**
- Modify: `src/types/architect.ts`
- Modify: `src/hooks/useClarificationLoop.ts`
- Modify: `src/lib/promptCompiler.ts`

**Interfaces:**
- `AnswerRecord.questionText?: string` retains the question wording for newly collected answers while remaining optional for older history.
- A pure normalization/filter helper removes answered question IDs, exact repeated wording, and only high-confidence near-duplicates.

- [x] Store original question text with each new answer and include question text plus answer in future Architect turns.
- [x] Filter answer duplicates before state becomes `questioning`; suppress close semantic paraphrases for shared decision facets.
- [x] If filtering removes all questions, move directly to blueprint compilation.
- [x] Confirm `npm run build` succeeds with legacy answer records lacking `questionText`.

### Task 5: Standardize transitions and interaction motion

**Files:**
- Create: `src/lib/motion.ts`
- Modify: `src/main.tsx`
- Modify: `src/components/ui/GlassCard.tsx`
- Modify: `src/components/forge/ClarificationLoop.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/modals/ToolLibrary.tsx`
- Modify: `src/components/modals/ProviderSettings.tsx`
- Modify: `src/components/modals/SkillManager.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Shared variants and transitions live in `src/lib/motion.ts`.
- `MotionConfig` applies user reduced-motion preference globally.

- [x] Add a shared page transition, staggered list entry, and spring response for quick answer/control interactions.
- [x] Animate content replacement through `AnimatePresence` and layout transitions without blocking input.
- [x] Apply reduced-motion behavior to CSS interaction states and Framer Motion translations, scale, and stagger.
- [x] Confirm `npm run build` succeeds.

### Task 6: Build the Windows application

**Files:**
- Verify: all files above.

- [x] Run `npm run build` and confirm TypeScript and Vite production build succeed.
- [x] Run `cargo check --release` from `src-tauri` and confirm the Rust backend remains valid.
- [x] Build a standalone Windows executable with `npm run tauri build -- --no-bundle`.
- [x] Report the artifact path and any installer-tool limitation separately.
