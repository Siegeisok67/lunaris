# Lunaris Studio Expansion Design

## Intent
Make Lunaris feel like a richer daily prompt workspace: give users several calm, visually distinct ambient scenes, make useful prompts easy to start, and make completed plans easy to organize, export, and follow.

## Goals
- Add a persistent Background Studio with six distinct scenes and simple intensity/motion controls.
- Add a curated template gallery for common coding, Blender, design, and research requests.
- Improve prompt history with pinning, archiving, deletion, robust search, and portable Markdown/JSON exports.
- Add an interactive execution checklist to blueprints and retain its progress in the related session.
- Keep startup and interaction costs low; honor reduced-motion preferences and provide static backgrounds.
- Preserve current Lunaris provider, skill, MCP, updater, and session data.

## Non-goals
- No new model provider or multi-agent orchestration in this change.
- No cloud sync or accounts; all new state remains local.
- No automatic execution of checklist items.

## Constraints and design calls
- Continue using the existing Tauri v2, React 19, TypeScript, Framer Motion, Lucide, and local storage command layer.
- Background selection and accessibility settings live in `LunarisSettings` and persist through the existing Rust-backed settings storage.
- Session organization metadata and checklist progress are optional fields, so older saved histories remain readable.
- Archive is reversible; deleting a session requires an explicit action and confirmation.
- Template selection fills the existing prompt editor and never submits automatically.
- Exported Markdown and JSON contain the prompt and blueprint only; image bytes and API credentials are excluded.
- Keep animations decorative and avoid creating more than one animation loop for the background.

## Feature set
1. Six background scenes: Moonlit, Aurora, Nebula, Meteor Shower, Eclipse, and Quiet Space.
2. Persistent background intensity control.
3. Motion setting with System, Reduced, and Still choices.
4. Animated scene transitions that respect reduced-motion.
5. A curated template gallery with categories and search.
6. Pin/unpin prompt sessions and prioritize pinned work.
7. Archive/unarchive sessions and filter active vs archived history.
8. Search history across titles, original prompts, and blueprint text; delete with confirmation.
9. Export individual blueprints as Markdown or JSON.
10. Interactive checklist extracted from the compiled plan, saved per session and restored on reopen.

## Acceptance
- Settings survive app restart and old settings load with Lunar-compatible defaults.
- Every scene has a visually distinct preview and changing scenes has no random theme mapping.
- Still mode stops canvas animation; System mode honors OS reduced-motion.
- Templates populate an editable draft and do not trigger network calls.
- Pinned sessions remain prominent; archived sessions are hidden from active history unless that filter is selected.
- Export files are named safely and contain no image payloads or secrets.
- Checklist progress updates immediately and survives reopening the session.
