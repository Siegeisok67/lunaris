# Lunaris Permanent Memory Design

## Intent
Remember stable user preferences and project facts across sessions so the Architect can avoid repeating resolved questions and the Executor can follow established project conventions.

## Approved product behavior
- Memory is local to this Lunaris installation and is saved through the existing Rust-backed app storage commands.
- The Memory workspace manages reusable Profile facts and named Project workspaces, each with entries that can be searched, edited, enabled/disabled, or deleted.
- The prompt composer lets the user select a project and toggle whether saved memory is included. It previews the active memory count and makes the active project explicit.
- Enabled Profile entries and entries from the selected Project are sent as labeled context to the Architect and, when streamed, the Executor. The current prompt always takes precedence if it conflicts with saved context.
- After a completed clarification loop, answers appear as suggestions. A user must explicitly save each suggestion; a selected project determines its default scope, otherwise it is offered as Profile memory. The user can edit the title and scope in the Memory workspace after saving.
- Prompt sessions remember the selected project. Switching projects, disabling memory, deleting an entry, or deleting a project changes what future prompts receive; past compiled blueprints remain as they were created.
- The app does not read API credentials or screenshot bytes into memory. The UI advises users not to paste secrets into text entries.

## Goals
- Reduce repeated questions while keeping the user in control of durable facts.
- Keep profile preferences separate from project-specific context.
- Make memory review, editing, disabling, and deletion straightforward.
- Keep old settings and prompt histories compatible by adding only optional fields.

## Non-goals
- No cloud sync, embedding service, vector database, background collection, or automatic learning without approval.
- No automatic rewriting of saved memories by the Architect.
- No importing image contents, environment variables, API keys, or local project files.

## Constraints
- Continue using Tauri v2, React, TypeScript, existing `storage_read` / `storage_write`, and existing Architect request routing.
- Keep memory bounded to 80 entries, 20 projects, and 12,000 included characters per prompt.
- Display which scope and project will be shared before sending a request.
- Never inject disabled, unrelated-project, or empty memory records.

## Acceptance
- Memory and project CRUD persist across app restarts.
- Profile memory applies to all prompts only when memory is enabled; project memory applies only when its project is selected.
- Architect receives the same active memory at every clarification turn and retry; streamed Executor receives the active context too.
- Answer suggestions remain unsaved until accepted and do not create duplicates.
- Reopened prompt sessions restore their project selection.
- Existing prompt sessions with no project and existing storage with no memory load normally.
