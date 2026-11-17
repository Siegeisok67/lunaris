# Lunaris Studio Expansion Implementation Plan

> **For agentic workers:** Native execution in this session; tasks use checkbox syntax for tracking.

**Goal:** Add a richer background studio, prompt starters, session organization/exports, and a persistent blueprint checklist.

**Architecture:** Extend the existing persisted settings and prompt-session models with backward-compatible optional fields. Keep background rendering in the existing canvas component, template choices in the prompt entry flow, and history/checklist actions in their current views.

**Tech Stack:** Tauri v2, Rust commands already present, React 19, TypeScript, Framer Motion, Lucide, existing storage wrapper.

**Spec:** `docs/superpowers/specs/2026-11-17-studio-expansion-design.md`

## Global Constraints
- Keep all new state local through existing Tauri persistence.
- Keep image bytes and credentials out of exports.
- Honor OS reduced-motion and provide still mode.
- Preserve compatibility with existing history and settings records.
- No auto-submit or automatic task execution.

## Review Focus
- Old settings without the new background fields get valid defaults.
- Old sessions without organization/checklist metadata still render and open.
- Search handles empty strings and archived/pinned combinations.
- Export filenames sanitize platform-invalid characters and export text only.
- Still mode does not schedule a canvas animation frame.

---

### Task 1: Background Studio

**Files:** `src/types/provider.ts`, `src/lib/storage.ts`, `src/components/layout/CelestialBackground.tsx`, `src/components/modals/ProviderSettings.tsx`, `src/App.tsx`, `src/styles/globals.css`.

- [ ] Add background scene, intensity, and motion preferences with migrations/defaults.
- [ ] Render six distinct scenes and respect intensity, System/Reduced/Still motion, and OS reduced-motion.
- [ ] Add persistent scene previews and controls to Settings.
- [ ] Apply settings to the mounted background and transition scene changes smoothly.

### Task 2: Prompt Template Gallery

**Files:** create `src/data/promptTemplates.ts`; modify `src/components/forge/PromptInput.tsx`, `src/styles/globals.css`.

- [ ] Add categorized templates for app development, Blender, UI redesign, bug investigation, API/backend, automation, research, and game prototyping.
- [ ] Add search/filter and template selection; selecting a template fills the editor only.

### Task 3: Prompt History Organization and Export

**Files:** `src/types/architect.ts`, `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/styles/globals.css`.

- [ ] Add optional pinned/archived metadata and persist pin/archive changes.
- [ ] Add active/archived filters and search across prompt/blueprint text; show pinned sessions first.
- [ ] Add explicit deletion confirmation.
- [ ] Export Markdown and JSON from both the current blueprint and history cards, excluding image data and secrets.

### Task 4: Blueprint Checklist

**Files:** `src/types/architect.ts`, `src/App.tsx`, `src/components/forge/BlueprintViewer.tsx`, `src/styles/globals.css`.

- [ ] Derive stable checklist entries from numbered/bulleted plan lines and fall back to a single review item when no steps parse.
- [ ] Add accessible completion toggles, progress display, and clear/reset control.
- [ ] Persist checklist completion on the active prompt session and restore it when reopened.

### Task 5: Integration and Build

**Files:** project sources above and repository mirror `repo-sync/`.

- [ ] Run `npm run build` to check TypeScript and production bundling.
- [ ] Synchronize source and docs into the Git checkout, review the diff, and publish the completed change to the connected repository.
