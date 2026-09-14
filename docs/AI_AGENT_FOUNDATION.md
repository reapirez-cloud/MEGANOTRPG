# AI Agent Foundation — Voss Stages 1–3

> Status: **STAGES 1–3 IMPLEMENTED**
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

## Persistence

Tables:

- `ai_models` — provider/model registry;
- `ai_agent_settings` — campaign-level agent model selection;
- `ai_threads` — one durable Voss thread per campaign/user;
- `ai_messages` — durable user/assistant history with the view context that accompanied user messages.

All public tables have RLS.

## Current limitations after Stage 3

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

4. AI Draft system for zones, NPCs, items and reusable mechanics.
5. Natural-language draft editing.
6. Approved draft execution through Oracle and canonical engines.
7. Campaign event memory / retrieval / summaries.
8. Model routing by task.
9. Explicit AI-GM mode.
10. Director / Narrator split for autonomous play.
