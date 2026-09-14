# AI Agent Foundation — Voss Stages 1–12

> Status: **STAGES 1–12 IMPLEMENTED**
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
→ Provider Gateway
→ configured provider
```

The Stage 9 gateway dispatches from `ai_models.provider_key`. Normal Voss traffic is limited to enabled `model_kind = agent` + `access_scope = campaign` rows.

DeepSeek is the current campaign-agent provider. Its dedicated server secret is:

- `DEEPSEEK_API_KEY`
- optional `DEEPSEEK_API_BASE_URL`, defaulting to the official DeepSeek API base URL.

The old `AI_API_KEY` / `AI_API_BASE_URL` / `AI_DEFAULT_MODEL` names remain only as migration compatibility for legacy `openai-compatible` rows. Provider failure never triggers a cross-provider fallback.

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

## Stage 6 — explicit approval and canonical execution

Stage 6 introduces the first path from an AI Draft into canonical MEGANOT state.

The authority boundary is deliberately asymmetric:

```text
Voss model
→ may create/revise AI Drafts
→ CANNOT approve/apply

GM UI
→ explicit confirmation
→ exact draft revision lock
→ application service
→ Oracle
→ canonical owner engines
```

The model is never given an `approve` or `apply` tool.

The Stage 6 executor lives in `src/ai/applyDraft.ts`. It does not write canonical domain tables directly. Canonical mutations are executed only through:

- `oracle.world.*` → Larisa;
- `oracle.characters.*` → Shapoklyak;
- `oracle.definitions.*` → Chasovoy;
- `oracle.inventory.*` → Cheburashka.

Supabase access from the executor is used for preflight reads and the AI apply-run journal only.

### Apply order

The executor plans the whole run before the first mutation.

```text
1. preflight / visibility / existing-target checks
2. parent locations before child locations
3. location sections
4. characters
5. class template assignments
6. Chasovoy definitions
7. location transitions
8. NPC habitats
9. item issuance through Cheburashka
10. mark exact AI Draft revision APPLIED
```

`parent_location` is folded into location creation. A transition uses an existing first section or an automatically-created `Переходы` section when the source location has no sections.

`depends_on` is intentionally blocked from canonical application because no canonical engine currently owns that generic relation. The GM must remove or replace it before applying the draft.

### Apply-run journal

`ai_draft_apply_runs` records:

- exact `draft_id` and `draft_revision`;
- the immutable planned step list;
- each completed step;
- canonical ids returned by owner engines;
- requesting GM;
- final status and error.

Possible statuses:

```text
running
succeeded
failed
partial_failed
```

The exact draft revision is locked before the first canonical mutation. A successful apply is allowed only when every planned step has a matching receipt.

A clean `failed` run may be retried for the same draft revision. `running`, `succeeded` and `partial_failed` runs block blind retries of that revision.

### Partial failure policy

The Stage 6 executor does **not** silently roll back already-created canonical entities. Cross-engine application is not one database transaction, and fake best-effort rollback would be more dangerous than an explicit partial state.

If a later step fails after any owner engine has succeeded:

```text
status = partial_failed
draft remains review
created canonical ids remain in the apply-run journal
GM gets the run id
automatic retry is blocked
```

Even if the canonical engine call succeeds but the following receipt write fails because of a network problem, the client sends `partial_hint=true` so the run is not mislabeled as a clean retryable failure.

This makes partial creation visible and inspectable instead of manufacturing duplicate locations/items on the next click.

### Final draft state

Only a fully completed run can move:

```text
ai_drafts.status: review → applied
```

The row also receives `applied_at` and `applied_by`.

Players still cannot approve AI Drafts, and the Voss model itself has no canonical execution capability.

## Stage 7 — durable campaign memory

Stage 7 adds a durable history layer for questions such as:

```text
Что было в прошлой сцене?
Когда мы впервые встретили этого NPC?
Почему группа не доверяет барону?
Кто обещал вернуть артефакт?
Что произошло перед закрытием той сцены?
```

The memory architecture deliberately separates **events**, **remembered facts** and **summaries**.

### Durable event log

`campaign_events` stores server-confirmed historical evidence.

Current automatic sources:

- game-category `chat_messages`;
- structured gameplay chat events such as rolls/actions/spells;
- `campaign_updates`;
- successful AI Draft apply-runs.

Flood chat is not ingested.

Existing history is backfilled by the Stage 7 migration, so memory starts with previous campaign data instead of only future messages.

Chat-memory rows stay synchronized with the source message:

- insert → event appears;
- edit → event text/payload updates;
- delete → event disappears.

The process-local `engineEventBus` remains deliberately ephemeral and is **not** treated as durable truth.

### Provenance and confidence

Each event stores:

- event type;
- source kind and source id;
- occurrence time;
- room/location/actor/participants where available;
- compact summary;
- structured payload;
- importance;
- confidence;
- provenance metadata.

A chat statement proves that the statement was recorded in the visible room. It does not automatically prove that the speaker's claim was objectively true.

### Visibility / secrets

Memory has its own RLS-aware visibility scopes:

```text
campaign
gm
room
users
characters
```

`room` delegates to the existing `private.can_read_chat_room` rule.

`users` intentionally has **no GM/admin override**. This preserves the project rule that user-only / "Только я" information must not become visible merely because someone is an administrator.

Facts and summaries use the same visibility contract.

### Remembered facts

`campaign_memory_facts` stores structured, derived memory such as:

```text
subject: Baron Kessler
predicate: owes
statement: "Барон обещал группе безопасный проход."
sources: [event ids]
confidence: 0.9
```

Facts are not canonical game state.

They support explicit lifecycle:

```text
active
superseded
retracted
```

A correction creates a new fact and can explicitly supersede the old one. Old memory is not silently overwritten.

### Saved summaries

`campaign_memory_summaries` stores lossy recap caches:

- title;
- summary;
- period start/end;
- key source event ids;
- visibility;
- model and creator provenance.

A summary helps retrieval but never replaces the underlying event evidence.

If a source event is edited or deleted, derived memory is invalidated automatically:

- active facts referencing that event become `retracted`;
- active summaries referencing that event become `invalidated`;
- normal retrieval ignores invalidated summaries and non-active facts.

This keeps "delete/edit the source" meaningful instead of leaving an AI echo of removed text behind.

### Voss memory tools

Read tools available to any user whose selected/base model supports tools:

```text
search_campaign_memory
read_campaign_timeline
```

The signed-in Supabase client performs these reads, so RLS filters memory before the model receives it.

GM-only write tools:

```text
remember_campaign_fact
save_campaign_summary
```

These write tools are not automatic. Voss may use them only when the GM explicitly asks to remember, fix or save something.

A normal question such as "что было вчера?" does not authorize a memory write.

### No visibility widening

A derived fact/summary may not be published more broadly than its source events.

Examples:

```text
GM-only source → campaign summary    BLOCKED
private room source → campaign fact BLOCKED
campaign source → GM summary        allowed
same room sources → room summary    allowed
```

The Stage 7 tool validates this server-side before writing derived memory.

### Current retrieval strategy

Stage 7 uses:

- structured timeline filters;
- source type / room / location / character filters;
- bounded lexical memory search;
- saved fact and recap caches.

Embeddings/vector retrieval are intentionally not canonical memory and are not required for Stage 7. They may be added later as an optional retrieval index.

### Canonical-current-state rule

For historical questions:

```text
campaign memory → evidence of what happened
```

For current-state questions:

```text
domain read-tool → current canonical owner state
```

If saved memory conflicts with current owner state, Voss must treat the owner state as current truth and memory as history.

## Stage 8 — task-aware model routing

Stage 8 separates the **agent** from the **model used for one request**.

The server classifies every Voss request before the provider call into one task:

```text
general
reference_read
memory_read
memory_write
workshop
draft_edit
```

The model never chooses its own route. Routing is deterministic server policy.

### Player lock

Player-originated requests are permanently:

```text
requester = player
→ base model
→ route_mode = base_lock
```

This rule ignores GM route preferences and campaign primary-model selection.

If the base model lacks a capability required by the classified task, the request remains on the base model and is marked `degraded`. The router does not silently grant players a stronger model.

### GM primary model

`ai_agent_settings.selected_model_id` is now the GM's **primary model**, not a promise that every task must use it.

The primary model is the normal default for:

- general conversation;
- explicit memory writes;
- Workshop content creation;
- AI Draft editing.

If the primary model lacks a required capability such as tool calling, the server may select a compatible fallback.

### Automatic economical reads

Default automatic routing for:

```text
reference_read
memory_read
```

selects the cheapest compatible model using:

```text
cost_tier ascending
latency_tier ascending
reasoning_tier descending
```

Only models that satisfy required capabilities are eligible.

This lets inexpensive models handle retrieval/tool orchestration while preserving stronger models for heavier authoring/reasoning work.

### Complex-task fallback

Workshop and draft-edit tasks prefer the GM primary model.

When fallback selection is required, compatible candidates are ranked using:

```text
reasoning_tier descending
supports_json preferred
cost_tier ascending
latency_tier ascending
```

This prepares the same routing layer for the future AI-GM Director without coupling Voss to one provider or model name.

### Registry metadata

`ai_models` now also contains:

```text
reasoning_tier  1..5
latency_tier    1..5
```

Existing metadata remains authoritative for capabilities:

```text
supports_tools
supports_json
supports_streaming
cost_tier
context_window
```

No provider/model names are hard-coded into routing logic.

### Per-task route policy

`ai_agent_model_routes` can override one campaign/agent/task route with:

```text
auto
primary
base
fixed
```

`fixed` references one registered model.

If a fixed or primary model is disabled or lacks a required capability, the router uses a safe fallback and records the reason.

### Audit trail

Every routing decision is recorded in `ai_model_route_runs`:

- campaign;
- user;
- thread;
- agent;
- classified task;
- actual model;
- route mode;
- reason;
- degraded flag;
- timestamp.

Users can read their own route history; campaign managers can inspect campaign route history. Clients cannot insert route audit rows directly.

Assistant messages also store their `task_key`.

### UI

The Voss panel continues to show the GM's **Основная модель** selector.

After a request it also shows the actual route:

```text
ROUTER · MEMORY_READ · <model> · AUTO
```

This prevents the UI from pretending the primary-model selector means the same model handled every request.

### Current registry state

Stage 8 works even with a one-model registry. With only the base model registered, all routes resolve to that model and capability-heavy tasks may be marked degraded.

As additional DeepSeek/Kimi/etc. models are registered with accurate capability/tier metadata, routing starts using them without changes to the Voss agent.

## Stage 9 — security and provider foundation

Stage 9 reconciles the Stage 1–8 agent stack with production and establishes the boundary required by the later image and developer systems.

### Source reconciliation

The cumulative Stage 1–8 branch is integrated into `dev` before Stage 9 work. Production database migrations and source control therefore describe the same agent foundation again. `main` remains untouched until the later READY stage.

### Real model registry

The placeholder `__default__` base row is replaced in place so existing message and routing foreign keys remain valid.

Current campaign-agent registry:

```text
DeepSeek V4 Flash          base, tools/json
DeepSeek V4 Pro            GM-selectable, tools/json
DeepSeek V4 Flash Vision   server-visible vision worker, not GM-selectable
```

The base model is now tool-capable, so Stage 3–7 read, draft and memory tools are no longer disabled by registry metadata.

`ai_models` now also records:

```text
model_kind      agent | image | owner_override
access_scope    campaign | system_admin
supports_vision boolean
```

Normal Voss routing filters to:

```text
enabled
AND model_kind = agent
AND access_scope = campaign
```

This filter is enforced in both database policy and server routing. A future owner-only model cannot become an automatic fallback merely because the service-role client can see its row.

### System authority is not campaign authority

`GM`, campaign `owner`, and global `system_admin` are different authorities.

System administrators are stored in the private-schema `private.system_admin_users` table and checked by `private.is_system_admin`.

No campaign owner or GM is automatically promoted to system administrator. Stage 9 intentionally seeds no system administrators. Developer Mode will activate this authority only when Stage 13 introduces its explicit session gate.

The service-only `public.is_system_admin_for_v1` RPC exists for trusted backend checks. Authenticated clients cannot execute it.

### Hidden-model isolation

Campaign model settings and per-task routes validate `selected_model_id` through `private.can_select_campaign_ai_model`.

A GM therefore cannot bypass the UI by guessing the UUID of:

- an image model;
- a non-selectable worker;
- a future `owner_override` model;
- a `system_admin`-scoped model.

The normal `ai_models` SELECT policy also refuses to expose those rows.

### Strict “Только я”

Owner-only data is literal ownership:

```text
created_by == auth.uid()
```

There is no GM, campaign-owner, admin or system-admin read override.

Stage 9 applies that rule to the existing private character, location and location-link paths through shared private-schema guards. Private rows are readable and manageable only by their creator. Existing campaign-visible/discovery behavior is unchanged for non-private rows.

### Provider Gateway

`voss-agent` no longer contains provider-specific fetch configuration.

```text
router
→ RouterModel
→ provider-gateway
→ provider_key dispatch
→ provider response
```

The gateway:

- validates that the chosen row is a campaign agent;
- resolves provider secrets server-side;
- sends OpenAI-compatible chat/tool payloads to DeepSeek;
- preserves the legacy provider adapter only for migration compatibility;
- returns provider errors to Voss without silently switching providers.

Astra is deliberately not registered here. The future Owner-only override belongs to Developer Mode, not ordinary campaign routing.


## Stage 10 — global Agent UI

Stage 10 turns the existing Voss conversation surface into one application-wide agent shell instead of a local floating widget.

### One global mount

The agent is mounted exactly once inside `UiV1App`:

```text
AIProvider
→ SnakeProvider
→ UiV1App
   → screens / routes
   → AgentShell
```

The entry point no longer mounts a second Voss widget outside the application tree. The old `VossDock` module remains only as a compatibility re-export and must not be mounted independently.

### Global agent mark

The old home-screen `VI` profile placeholder is removed.

A single geometric `AgentMark` / orb is fixed at the top-right application edge and is visible across routes. It does not add item-level AI buttons to characters, locations, items or class cards.

This is deliberate:

```text
one global agent entry
+ current semantic context
≠ hundreds of local "generate / ask AI" buttons
```

### Responsive shell

Desktop:

```text
right-side panel
≈ 350–430 px
full application height
```

Mobile:

```text
bottom sheet
≈ 76dvh
max 82dvh
safe-area aware
```

The panel is dismissible by the close control, backdrop and Escape. It remains mounted while the user navigates, so an open Voss conversation can immediately observe the newly composed semantic context.

### Semantic context shortcuts

The shell reads the same composed `AIViewContext` that is sent to `voss-agent`.

Prompt suggestions adapt to:

- current entity;
- exact screen kind;
- class/subclass/feature reference pages;
- character views;
- world/location views;
- Workspace;
- GM Workshop;
- unsaved Snake/editor values.

Suggested prompts only fill the composer. They do **not** call the model automatically.

Stage 10 intentionally contains no image-generation shortcut. Image intent will become an agent tool in Stage 11, where quota, job state, review and attachment permissions exist.

### Global invocation bridge

`agentUiBridge.ts` exposes one browser event:

```text
meganot:agent:open
```

Internal UI systems may request that the existing global shell open and may optionally prefill a prompt. They must not mount another agent panel.

This gives Snake and future contextual surfaces one shared agent entry point without coupling them to AgentShell internals.

### Existing capabilities preserved

The new shell still exposes:

- current semantic screen/entity state;
- unsaved-draft warning;
- GM primary-model selection;
- actual router/model result;
- campaign conversation history;
- durable memory access through the server;
- latest GM AI Draft summary;
- explicit send-only composer.

Stage 10 changes the interaction shell, not the authority boundary. Voss still cannot approve drafts, mutate canonical state directly or bypass RLS.


## Stage 11 — Agent Jobs and generated media

Stage 11 adds the first long-running agent execution path.

The core rule is:

```text
agent intent
→ agent_job
→ provider worker
→ durable outputs
→ optional review
→ explicit attachment
```

Generation is not attachment.

### Unified Agent Jobs

`agent_jobs` is the shared execution journal for present and future agent work.

The job type contract already reserves:

```text
image_generate
image_review
image_attach
draft_create
draft_revise
draft_apply
mechanics_compile
dev_patch
dev_test
dev_build
dev_preview
dev_deploy
```

Current Stage 11 execution uses `image_generate`, `image_review` and `image_attach`.

Job states:

```text
queued
running
waiting_for_user
completed
failed
cancelled
```

Clients may read their own jobs but cannot forge job rows or statuses directly.

### Semantic Image Profiles

The agent never selects raw quality simply because a user mentioned an image.

It supplies a semantic purpose:

```text
icon
ui_preview
portrait
panel
hero_art
master_art
```

The server maps this to an Image Profile:

```text
tiny_icon    → cheap/fast icon generation
ui_preview   → economical UI preview
portrait     → portrait-quality output
panel        → wide UI panel
hero_art     → high-quality atmospheric art
master_art   → premium final/master output
```

Tiny UI assets therefore do not consume master-art quality by accident.

Reference-heavy generation may promote the provider model while preserving the semantic size/quality contract.

### Exact variant count

`generate_image.variants` is an exact user contract:

```text
requested 1 → deliver 1
requested 2 → deliver 2
requested 3 → deliver 3
```

If the user explicitly requests three images, Voss must call:

```text
variants = 3
```

The provider receives the requested count in one batch. If it returns fewer images, the worker requests the missing count again up to the bounded retry limit.

The job is complete only when `completed_outputs == requested_outputs`.

### Review never filters outputs

DeepSeek Vision may review the finished alternatives and store:

- preferred variant;
- complete ranking;
- short comparison;
- per-variant notes.

This review is advisory.

The non-negotiable presentation law is:

```text
show_all_requested_outputs
```

If three images were requested, the Agent UI renders all three. A preferred variant receives a small `Выбор Восса` mark, but no generated alternative is hidden, discarded or replaced by the reviewer.

### Generated media lifecycle

`media_assets` stores durable generated outputs.

States:

```text
generated
reviewed
attached
rejected
garbage
```

Runtime generated files live in the existing private `campaign-media` bucket:

```text
<campaign>/<creator>/ai-assets/<asset>/image.webp
```

An unattached asset is creator-visible only.

After attachment, `media_bindings` delegates visibility to the canonical target. Character and location images therefore inherit their target visibility instead of becoming campaign-global simply because the file exists.

### Generate != attach

`generate_image` never implies a canonical media change.

`attach_generated_image` is a separate explicit action with another server-side permission check.

Current targets include:

- character media;
- location media;
- campaign reference-definition media slots;
- campaign gallery.

Legacy fields are synchronized where a canonical column already exists:

```text
character avatar → characters.avatar_url
location image   → locations.image_url
```

Other semantic slots remain explicit `media_bindings` rather than forcing unrelated schema columns into every domain table.

If more than one variant was generated, Voss is forbidden to choose and attach one by itself. The user chooses first.

### Player quota

Player generation is limited to:

```text
10 generated outputs / day
```

Variants consume outputs. One request for three variants consumes three.

The reservation RPC locks the user's daily quota before inserting the job, so simultaneous requests cannot trivially bypass the limit.

GM/campaign owner has no application-level daily image quota.

Provider-side quotas and billing still apply independently.

### Natural-language follow-up

The UI does not add a separate image-generation button to every entity.

Users continue talking to the global agent:

```text
сделай ему портрет
сделай три варианта
поставь вторую
удали мусор
```

For references such as `вторая`, Voss first reads recent image jobs and resolves the exact `job + variant_index`.

The Agent UI polls active jobs, resolves private storage paths to signed URLs and shows all job outputs as they become available.

### Garbage lifecycle

Unused generated media is not deleted immediately.

```text
mark garbage
→ wait at least 3 days
→ purge storage object + media row
```

Attached media cannot be marked garbage.

This provides a short recovery window while still allowing generated clutter to be cleaned deliberately.



## Stage 12 — Mechanics Compiler

Stage 12 gives Voss a safe path from natural-language mechanic design to the **existing** Character Engine contract.

It does not create a second rules engine.

The pipeline is:

```text
GM intent
→ Voss structures candidate StoredMechanics
→ deterministic Mechanics Compiler
→ CE / GM / hybrid coverage check
→ validation + target snapshot
→ saved compilation artifact
→ preview
→ explicit GM apply
```

If the existing runtime cannot represent a required durable mechanic safely:

```text
unsupported
→ do not fake it
→ Developer Mode in Stage 13
```

### Existing DSL is the target

The compiler accepts the established `StoredMechanics` families:

```text
numeric
formula
grant
resource
action
spell
```

It does not invent arbitrary mechanic types or top-level fields.

Every executable mechanic produced by the compiler requires:

- stable `id`;
- stable `sourceKey`;
- valid existing CE targets/operations;
- bounded JSON/formula structure.

`sourceKey` is mandatory in compiled mechanics because suppression, provenance and debugging must remain stable.

### CE / GM / hybrid boundary

Every compilation contains explicit rule coverage.

Each rule clause is classified as:

```text
ce      → persistent/deterministic state owned by the application
gm      → scene/action/narrative legality adjudicated by the human GM
hybrid  → CE owns the durable part; GM adjudicates the scene part
```

Examples of CE-owned state:

- finite resources;
- persistent grants;
- numeric modifiers;
- formulas;
- persistent choices represented by an existing generic contract;
- spell access and resource costs.

Examples that are **not** silently promoted into runtime state:

- target is visible/willing/reachable;
- hit was confirmed;
- saving throw failed;
- weather/terrain/corpse/free space exists;
- Action/Bonus Action/Reaction is still available;
- once per turn/round when MEGANOT does not own a real turn tracker.

The compiler explicitly rejects fake state patterns used to simulate those facts.

GM-only coverage must have no executable mechanic ids. Hybrid coverage references only the durable part.

### Resource policy

Persistent compiler-created resources may recharge only from authoritative events currently owned by the app:

```text
short_rest
long_rest
dawn
```

A rule such as `once per long rest` may therefore be represented honestly by a finite resource.

A rule such as `once per turn` must remain exact rule text until an authoritative turn runtime actually exists.

### Validation

The deterministic compiler validates, among other things:

- mechanic family;
- allowed fields;
- numeric targets/operations;
- formula syntax and depth;
- conditions;
- grants;
- resources and recovery;
- action costs/options/requirements/effects;
- state mutations;
- spell identity/preparation/methods;
- spell catalog slug existence;
- duplicate mechanic ids;
- payload size/depth.

Validation is performed after the model proposes structured data. Model output alone is never treated as executable truth.

### Compilation artifacts

Validated/unsupported results are stored in:

`ai_mechanics_compilations`

The artifact stores:

- intent;
- normalized mechanics;
- CE/GM/hybrid coverage;
- diagnostics;
- unsupported requirements;
- exact target snapshot;
- compiler version;
- apply result if later applied.

The client may read only its own compilations. Direct client insert/update/delete is denied.

Each compile also records an `agent_jobs.job_type = mechanics_compile` entry.

### Compile does not apply

`compile_mechanics` never changes canonical game state.

A validated card is shown in the global Agent UI with:

- title and compiler version;
- validation state;
- mechanic count;
- CE / hybrid / GM coverage counts;
- unsupported reasons and error count.

The UI action **only prefills** an explicit natural-language apply request. It does not call an apply RPC directly.

### Explicit apply

`apply_mechanics_compilation` is available only to GM/owner through Voss.

The server then calls the service-only apply gate.

Current safe apply targets are:

```text
campaign reference_definition
custom campaign rule_template
custom campaign rule_template_level
```

The apply gate repeats authority checks and compares the saved target snapshot with the current target.

If the target changed after compilation:

```text
mechanics_target_conflict
→ no overwrite
→ compile against the fresh target again
```

Reference definitions use their canonical revision system: applying mechanics creates a new revision while preserving the current name, summary, rules text and data.

### Built-in classes and subclasses

Built-in `rule_templates` are **preview-only** for the runtime compiler.

The compiler may explain and validate proposed mechanics for them, but runtime apply raises:

```text
builtin_template_requires_developer_mode
```

Built-in class/subclass mechanics remain code/package work because the project requires class-package quality gates, parser→CE tests, low/mid/high-level checks and migration discipline.

Stage 13 is the path for that work.

### AI Draft cannot bypass the compiler

Stage 12 closes the old AI Draft loophole.

If a definition node contains non-empty executable `mechanics`, its payload must also contain:

```text
mechanics_compilation_id
```

Before publishing the draft, the application:

1. reads that compiler artifact through RLS;
2. requires status `validated` or already `applied`;
3. requires the same campaign;
4. compares the draft mechanics with the exact normalized compiler mechanics.

Any mismatch stops publication.

Therefore:

```text
AI Draft raw mechanics
≠ shortcut around Mechanics Compiler
```

### Unsupported mechanics

`unsupported_requirements` is intentional, not a failure to look clever.

When a rule needs a reusable durable capability that the current CE contract genuinely lacks, Voss records that requirement and marks the compilation `unsupported`.

It must not:

- create arbitrary SQL;
- hide the gap inside an opaque semantic effect that is expected to mutate authoritative state;
- invent a source-specific mini-engine;
- manufacture fake scene state;
- claim the mechanic is finished.

That gap becomes a candidate for Stage 13 Developer Mode, where code, tests and build validation can extend the generic runtime deliberately.


## Persistence

Tables:

- `ai_models` — provider/model registry;
- `ai_agent_settings` — campaign-level agent model selection;
- `ai_threads` — one durable Voss thread per campaign/user;
- `ai_messages` — durable user/assistant history with the view context that accompanied user messages;
- `agent_jobs` — durable agent execution queue/journal;
- `media_assets` — generated media lifecycle and review metadata;
- `media_bindings` — explicit attachment from generated assets to canonical targets;
- `ai_mechanics_compilations` — validated mechanics previews, coverage, diagnostics, target snapshots and apply history.

All public tables have RLS.

## Current limitations after Stage 12

Voss can now compile GM-authored mechanics into the existing CE DSL, preserve the CE/GM boundary, preview diagnostics and apply a validated artifact to narrowly supported **custom campaign** targets after explicit GM instruction.

Stage 12 deliberately cannot mutate built-in class/subclass packages, invent missing runtime primitives or write repository code. Unsupported reusable mechanics must remain unsupported until Developer Mode extends the generic runtime with code and tests.

## Planned continuation

13. Owner-only Developer Mode with repository patch/test/build/preview workflow.
14. Full security/integration audit, READY certification and only then `dev → main`.
