# Lunaris Workbench Design

## Intent

Help users take a software idea from first draft through a usable, verified result without losing context between stages. Add the five complementary workbench capabilities already discussed: Executor follow-up, blueprint revisions, tool connection checks, local backup and restore, and reusable workflow presets.

## User flow

1. A user starts an app or software request as usual. The Architect returns a short set of ordered stages for discovery and a minimal first draft, verification, feature expansion, and polish. Users can edit stage names and goals before starting.
2. The user selects a stage and chooses **Run stage** for the configured streaming Executor or **Copy stage prompt** for an IDE agent. Stage prompts carry the blueprint and ask the Executor to work only on that stage and return evidence for its checks.
3. The user reviews the Executor's output, tests the app themselves if appropriate, and marks the stage verified. An Executor's statement that a test passed is recorded as reported evidence; it does not automatically count as user verification.
4. Users can ask follow-up questions in the session, save a blueprint revision before meaningful changes, compare revisions, and restore an earlier one.
5. A workflow preset can start a prompt template and carry selected skill IDs and registered app/MCP IDs into Architect context. Presets remain editable in the existing template gallery.
6. From Tools & MCP, a user can explicitly check an app path or HTTP MCP endpoint. Lunaris reports what the check actually established. It does not run configured stdio commands or call remote tools as part of a check.
7. Users can export an encrypted-free local backup JSON containing settings, prompts, memories, custom skills, and presets. Restore previews the contents and merges records by stable IDs. API keys and credentials are never exported.

## Goals

- Stage application work into small user-reviewable increments.
- Make first drafts, tests, expansion, and polish visible in a dedicated Design Studio section.
- Support both streamed Executor work and IDE prompt handoff for every stage.
- Preserve chat, stage status, revisions, and checklist state with the existing prompt history.
- Let users compare and restore revisions without silent replacement.
- Provide explicit, bounded diagnostics for registered apps and MCP endpoints.
- Make workflows portable through local presets and backups that exclude credentials.

## Non-goals

- Lunaris will not directly execute code, launch apps, run arbitrary shell commands, or operate on a user's IDE project in this release.
- An Executor response is not proof that a test or visual check was performed.
- HTTP MCP health checks only check endpoint reachability and response status; they do not initialize the MCP protocol or execute a tool.
- No automatic model downloads, provider requests, tool execution, or memory saving are added.
- No API keys, credential-store values, screenshot bytes, or staged image files enter exported backups.

## Design decisions

- Keep the established React, TypeScript, Tauri v2, Rust, reqwest, and Framer Motion stack; add no dependencies.
- Extend the Architect JSON contract with an optional `workflow_stages` array and normalize missing or malformed stage output into a conservative local default for software requests.
- Use explicit stage states: `pending`, `in_progress`, `needs_changes`, and `verified`. Only a user action changes a stage to `verified`.
- Keep Executor follow-up conversation and revisions attached to the owning `PromptSession`; cap retained entries to keep local history bounded.
- Store workflow presets in application settings with title, prompt, category, and stable selected skill/tool IDs. Ignore unavailable IDs after imports and warn the user.
- Make checks user-triggered. App paths are checked for existence; URL MCP endpoints use a short-timeout HTTP request. Stdio MCP settings are checked for configuration completeness and executable path existence only.
- Backups use a versioned JSON envelope. Import validates the envelope, shows a summary, and merges by IDs after explicit confirmation. Current credential-store values stay untouched.
- Preserve Lunaris's existing dark glass style, motion preferences, keyboard focus states, and narrow-window layout.

## Failure handling

- Old history and old settings without workflow fields continue to load.
- Invalid stage, chat, revision, preset, or backup data is dropped with a visible message; it does not reset unrelated saved collections.
- A failed save keeps the last persisted state and reports an error.
- Endpoint timeouts and non-success responses show as an inconclusive/unhealthy result with the response status where available.
- Missing local application files and malformed stdio configurations are called out separately.

## Success criteria

- A software blueprint presents editable ordered stages, including a small first draft and explicit test/verification stages.
- The user can run or copy one stage without asking the Executor to complete later stages.
- Stage status, follow-up transcript, and blueprint revisions survive app restart through prompt history.
- A user can inspect a revision diff and restore that revision.
- Workflow presets select a prompt and carry only configured existing skills/tools into Architect context.
- App and URL checks run only after a user clicks Check and show bounded, readable results.
- A backup round trip restores settings, history, memory, skills, and presets while never containing provider credentials.
- The frontend production build succeeds.

## Builder calls

- Use a dedicated `studio` navigation page embedded in the existing workspace.
- Show stage test expectations and verification evidence next to each stage.
- Keep the first version focused on prompt orchestration and evidence tracking; direct execution integration can be added later when Lunaris has a supported project-root and tool permission model.
