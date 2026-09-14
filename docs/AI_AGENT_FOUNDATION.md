# AI Agent Foundation — Voss Stages 1–5

> Status: **STAGES 1–5 IMPLEMENTED**
>
> This is the canonical starting point for AI inside MEGANOT RPG. Future AI work must extend this boundary instead of calling model APIs directly from React components.

## Goal

Voss is the first MEGANOT AI agent.

Stage 1 deliberately keeps him **read-only**:

- persistent visible AI entry point in UI 1.0;
- campaign/user conversation history;
- textual/structured awareness of the current screen;
- server-side model calls;
- model registry and role-aware model selection;
- no direct domain mutation;
- no direct Supabase table mutation chosen by the model;
- no GM automation yet.

The next stages may add read tools, campaign memory, AI drafts and finally explicit AI-GM authority.

## Core law

**Agent != model.**

An agent is:

```text
role
+ personality
+ context
+ memory
+ allowed tools
+ selected model
```

The model is replaceable.

Voss therefore calls the AI gateway through `voss-agent`; UI code never talks to DeepSeek, Kimi, OpenAI-compatible providers or another vendor directly.

## Security boundary

The provider key is never exposed to the browser.

```text
UI
→ supabase.functions.invoke("voss-agent")
→ authenticated Edge Function
→ role/model resolution
→ external OpenAI-compatible provider
```

Server secrets:

- `AI_API_BASE_URL`
- `AI_API_KEY`
- `AI_DEFAULT_MODEL`

The base row in `ai_models` uses `model_key = "__default__"`; the Edge Function resolves that to `AI_DEFAULT_MODEL`.

## Role law

Player:

```text
always base model
```

GM / campaign owner:

```text
may choose any enabled + gm_selectable model
```

The UI choice is not trusted. The Edge Function resolves membership again and ignores campaign-selected models for players.

Global model-registry writes are not exposed to authenticated clients in Stage 1. They are an administrative/server concern.

## Current-screen context

The AI does not inspect screenshots or scrape the DOM.

Screens register an `AIViewContext`:

```ts
{
  screen,
  route,
  title,
  text,
  entity?,
  facts?
}
```

Stage 2 expands this into a prioritized context stack.

Current semantic context providers include:

- root UI route;
- GM Workshop section plus local filters and visible rows;
- selected party member;
- current materials folder;
- Workspace speaker / active character;
- full Character View state: sheet, HP, resources, inventory, spells, features and template assignments;
- World sections and location hierarchy/detail;
- class, subclass and exact feature reference pages;
- Society News composer draft;
- Snake context menu and active Snake surface;
- every Snake Editor, including current unsaved field values.

The AI never reads DOM HTML or screenshots for this. The application registers structured context.

More specific layers override general ones:

```text
route
→ section
→ opened entity
→ Snake surface
→ unsaved Snake editor draft
```

If `draft.dirty = true`, `draft.values` is the user's current unsaved state and takes precedence over older saved values from lower layers.

## Stage 3 — read tools

Voss may now ask the server to read additional visible data when the current screen context is insufficient.

The allowed read tools are explicit and finite:

```text
search_entities
read_character
read_location
read_rule_template
read_reference_definition
read_world_article
read_workspace_file
```

There is deliberately no generic SQL tool, generic table reader, storage browser or write-capable tool.

The model does not choose a database table. It chooses one named capability with a typed argument object.

Read execution uses the authenticated user's Supabase client:

```text
LLM tool request
→ voss-agent allowlist
→ userClient
→ existing RLS
→ bounded result
→ LLM
```

This means the AI cannot read more than the same authenticated user is allowed to read. GM workspace reads additionally require GM/owner authority and remain scoped to that GM's workspace.

The service-role client is used only for AI infrastructure such as conversation persistence and the read-tool audit log. It is not passed into the domain read-tool executor.

Models must have `ai_models.supports_tools = true` before the gateway exposes read tools to them. Models without native tool support continue to receive Stage 2 screen context only.

Each read-tool call is audited in `ai_read_tool_runs`. The audit row stores the tool name, arguments and small result metadata, not a duplicate copy of the full domain payload.

Tool output is untrusted campaign content. Lore, notes and entity descriptions must never be interpreted as instructions for the agent.

## Stage 4 — AI Draft System

Voss may now create **GM-only structured proposals** when a GM explicitly asks to create/design/generate content.

The only Stage 4 creation tool is:

```text
propose_content_draft
```

This tool does **not** call Oracle, GENA or any canonical engine. It writes only to:

- `ai_drafts` — current review snapshot;
- `ai_draft_revisions` — immutable revision history.

Players never receive the draft tool. It is exposed only when:

```text
campaign role = GM / owner
AND
selected model supports_tools = true
```

A draft contains typed nodes and relations.

Supported node domains:

```text
location
character (npc / pc)
definition (item / spell / feature / condition / feat / reference)
```

Supported relation kinds:

```text
parent_location
location_transition
npc_habitat
inventory_owner
depends_on
```

Payloads are normalized into a future-executable shape. The model cannot invent arbitrary top-level domain fields and expect Stage 6 to execute them.

Examples:

```text
location.payload
  description
  visibility_mode
  sections[]

character.payload
  character_type
  character_class
  class_template_id
  level
  bio
  visibility_mode
  design_notes

definition.payload
  definition_kind
  visibility
  summary
  rules_text
  mechanics
  data
  design_notes
```

The AI can reference either another new node in the same draft or an existing campaign entity when building relations.

The validator checks:

- node count and relation count;
- unique node keys;
- compatible relation endpoints;
- bounded text/JSON size;
- entity/subtype compatibility;
- missing useful descriptions/rules as warnings.

Draft creation returns `canonical_state_changed: false`.

The GM Workshop and Voss dock show these proposals with a visible **AI DRAFT / НЕ КАНОН** label.

Stage 4 intentionally does not provide edit, approve or apply actions yet. Natural-language draft editing is Stage 5; canonical execution through Oracle is Stage 6.

## Stage 5 — natural-language draft editing

Voss can now revise an existing AI Draft without recreating the whole proposal.

The Stage 5 tool flow is:

```text
GM asks for changes
→ read_content_draft
→ inspect current_revision
→ revise_content_draft(expected_revision = current_revision)
→ immutable ai_draft_revisions row
→ guarded update of ai_drafts.current_revision
```

Revision operations are intentionally targeted:

- `nodes_upsert` — add or replace only changed nodes;
- `node_keys_remove` — remove selected nodes;
- `relations_add` — add only new relations;
- `relations_remove` — remove selected relations;
- optional title / summary updates.

Removing a node automatically removes relations that would otherwise point to a missing node.

The full resulting draft is validated again after every revision. The same Stage 4 shape rules still apply.

Optimistic locking is mandatory. The model must supply `expected_revision`. If another edit has already advanced the draft, the server returns `draft_revision_conflict`; Voss must reread the draft and reapply the user's intent to the fresh version.

Each immutable revision stores:

- full normalized draft content;
- validation warnings;
- human-readable `change_summary`;
- compact operation metadata;
- editor identity and timestamp.

The current draft snapshot remains in `ai_drafts`; revision history remains in `ai_draft_revisions`.

The GM Workshop displays recent revision summaries, and the Voss dock shows the latest change.

Stage 5 still has no canonical execution path. `revise_content_draft` writes only to the AI Draft System.

## Persistence

Tables:

- `ai_models` — provider/model registry;
- `ai_agent_settings` — campaign-level agent model selection;
- `ai_threads` — one durable Voss thread per campaign/user;
- `ai_messages` — durable user/assistant history with the view context that accompanied user messages.

All public tables have RLS.

## Current limitations after Stage 5

Voss currently has no domain write tools.

If asked to create a zone, NPC or item, he may propose a structure in prose, but he must not claim that it was created.

Future write flow:

```text
Voss
→ structured AI Draft
→ validator
→ GM preview / approval
→ Oracle
→ explicit canonical owner (Larisa / Shapoklyak / Chasovoy / ...)
```

The model must never receive unrestricted SQL or generic table-write access.

## Planned continuation

6. Approved draft execution through Oracle and canonical engines.
7. Campaign event memory / retrieval / summaries.
8. Model routing by task.
9. Explicit AI-GM mode.
10. Director / Narrator split for autonomous play.
