# AI Agent Foundation — Voss Stage 1

> Status: **IMPLEMENTED FOUNDATION**
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

The GM Workshop currently registers:

- current workshop section;
- campaign title;
- useful counts;
- a bounded textual list of visible relevant rows.

Future screens should register semantic state, including unsaved form values when useful. Do not send raw DOM HTML.

## Persistence

Tables:

- `ai_models` — provider/model registry;
- `ai_agent_settings` — campaign-level agent model selection;
- `ai_threads` — one durable Voss thread per campaign/user;
- `ai_messages` — durable user/assistant history with the view context that accompanied user messages.

All public tables have RLS.

## Stage 1 limitations

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

1. Read tools for classes, subclasses, character resolved state and GM Workshop entities.
2. AI Draft system.
3. Natural-language draft editing.
4. Campaign event memory / retrieval / summaries.
5. Explicit AI-GM mode and Director/Narrator split.
