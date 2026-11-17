# Tools, Skills, Clarification, and Motion Design

## Intent

Make Lunaris's execution blueprints accurately describe the applications, MCP tools, and skills available to the Executor. Prevent the Architect from asking the user for decisions they already answered, and make state changes feel continuous across the interface.

## Goals

- Persist a user-editable catalog of local applications such as Blender, Krita, GIMP, VS Code, and Notepad++.
- Persist a separate MCP catalog with server details and exact callable tool names and descriptions.
- Let the Architect select relevant catalog entries and make the compiled blueprint include only valid selected entries.
- Give the Architect enough skill guidance to select skills by purpose, and make the Executor blueprint explicitly invoke selected skills while retaining their full instructions.
- Suppress repeated clarification questions, including reworded duplicates, after an answer has been recorded.
- Use coherent, smooth transitions for page, clarification, modal, and control state changes.
- Honor `prefers-reduced-motion`.

## Proposed design

### Local application catalog

Add a **Tools** workspace with a **Local applications** section. Each record has a stable ID, display name, absolute executable path, short purpose, trigger terms, and optional usage notes. Users create, edit, enable/disable, and delete entries. Lunaris stores the catalog in its existing local settings collection.

The Architect receives enabled application names, purposes, triggers, and paths as context. It returns selected catalog IDs. The compiler validates IDs against the current catalog and includes selected paths and notes in a **Relevant applications** section. Lunaris does not launch applications in this design.

### MCP catalog

The same workspace has a separate **MCP servers** section. Each record has a stable ID, server display name, connection kind (local command or URL), command/path or endpoint, arguments where applicable, purpose, and trigger terms. Each server contains one or more tool records with the exact exposed tool name, a description, and optional usage notes.

The Architect receives enabled MCP server and tool summaries and returns selected tool IDs. The compiler validates those IDs and emits exact server/tool names and usage notes under **Available MCP calls**. Lunaris stores connection metadata for prompt construction; the configured Executor remains responsible for accessing and calling MCP tools. Secrets and environment-variable values are not stored in this catalog.

### Skill selection and invocation

The Architect receives each enabled skill's stable ID, name, description, triggers, and concise guidance extracted from its Markdown. It returns selected skill IDs. The compiler validates the selection, emits an explicit provider-neutral instruction to invoke each selected skill by stable ID before the relevant work, then includes the full skill Markdown as fallback instructions. This avoids assuming one IDE's slash-command syntax while keeping skill invocation explicit.

### Clarification memory

Extend answer records with the original question text while preserving compatibility with older history entries that only have question IDs. Include both question text and answer in each Architect turn. Before presenting a returned question, compare its stable ID and normalized meaningful terms with answered questions. Drop exact and high-confidence near-duplicates. If filtering removes all pending questions, compile the result instead of showing an empty questioning state.

### Motion system

Add shared Framer Motion variants and timing presets for workspace changes, modal/library entry, question replacement, card lists, and interactive choice controls. Use short opacity/position transitions for navigation, spring response for answer chips, and restrained stagger for new cards. Keep motion decorative and non-blocking, and reduce or remove movement under `prefers-reduced-motion`.

## Persistence and compatibility

- Store tool and MCP catalogs in the existing `$APPDATA/Lunaris/settings.json` settings collection.
- Missing catalog properties in older settings files load as empty collections.
- Existing user-created Markdown skills remain the source of skill content.
- Existing history answer records remain readable; question text is optional for legacy records.
- Validate paths and IDs as data, but do not require the referenced executable or MCP server to be present when editing a record.

## Non-goals

- Lunaris does not install, launch, or configure the listed applications.
- Lunaris does not itself connect to MCP servers or execute MCP tools.
- Lunaris does not store MCP credentials or secret environment values.
- The blueprint does not assume a host-specific skill invocation syntax; the selected skill rules are embedded in full.

## Approved MCP execution boundary

The MCP catalog is prompt context only. Lunaris does not connect to or call MCP servers; the configured Executor supplies actual MCP access.

## Acceptance criteria

- A user can save, edit, disable, and remove local-app and MCP catalog entries; they survive restart.
- A clarification request presents the Architect with enabled, relevant app/tool metadata, and the blueprint contains only valid selected IDs with exact registered names and locations.
- A selected skill is called out by ID before its full Markdown rules are included in the blueprint.
- A previously answered question is not shown again when the Architect reuses its ID or returns a clear rewording.
- Page and question changes animate consistently, and reduced-motion preference prevents large movement.
- Existing provider settings, history, and user skill files continue to load.
