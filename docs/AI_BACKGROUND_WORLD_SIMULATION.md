# AI Background World Simulation

> Status: **DESIGN LOCKED — implementation roadmap for experimental AI worlds**

## Goal

Make an experimental AI world continue to change even when the player is not directly interacting with a person or place.

This system is intentionally separate from the primary AI GM.

- **Primary GM** runs the current scene and makes deliberate story decisions.
- **DeepSeek V4.1 Flash** is the fixed cheap background-world worker.
- **World Resolver** owns randomness. Models do not choose or reroll random values.
- Background simulation runs on **game time**, never real wall-clock time.
- The system exists only in campaigns backed by `ai_world_slots`.

## Core laws

### 1. Randomness belongs to the server

A model never writes "I rolled 73".

Every random decision is resolved server-side and recorded with an idempotent decision key.

There are two forms:

1. **Automatic daily rolls** generated before Flash sees the entity:
   - one world d100 per campaign day;
   - one d100 per selected NPC;
   - one d100 per selected location.
2. **Requested development rolls**:
   - Flash (or later the primary GM) may discover a genuine branching question while interpreting canon;
   - it must describe the question and the possible outcomes/bands **before seeing the roll**;
   - World Resolver rolls and returns the result;
   - the model must continue from that result and cannot reroll the same decision key.

The second form exists specifically to prevent models from repeatedly selecting the safest/highest-probability continuation.

### 2. Resolver owns both selection and daily d100 rolls

For every new game day, World Resolver builds the eligible simulation-unit pool and performs all random work before Flash is called.

For every eligible NPC and eligible location, Resolver independently applies the configured daily inclusion probability (default: 30%). It does **not** map entity numbers onto a d100 and it does not ask the model which entities should move today.

After selection, Resolver rolls one separate d100 for every selected entity and one global world d100.

Flash receives **only the selected simulation units and their already-resolved d100 values**. It does not receive the rejected candidate pool, cannot swap candidates, and cannot request a reroll of the daily selection/severity.

The 30% rule is an expected coverage rate, not an exact quota. This is preferred to forcing exactly `round(count * .30)` entities because small worlds should naturally have days where nobody changes.

Selection and daily severity rolls are server-side and auditable.

Eligibility rules:
- published, canonical entity;
- not archived/deleted;
- NPC is not a PC;
- entity is not protected by an active hard runtime transition;
- entities in an actively resolving scene can be skipped until the next daily pass.

Selection modifiers should be conservative:
- recently background-changed entity: temporary cooldown / lower chance;
- recently encountered NPC/location: modest priority bonus after cooldown;
- entity that has gone many game-days without a background event: modest stale bonus.

The final effective probability must remain bounded. The system must not guarantee that every stale entity changes.

### 2.1 Simulation units are whole entities

Background simulation operates on **whole world entities**, never arbitrary physical fragments.

For characters/NPCs, eligibility is based on **persistent agency**, not narrative importance.

A creature can be a background simulation unit even if it began as a minor or random encounter NPC. A goblin who survives an encounter may later change jobs, join a faction, gain status, lose money, become injured, start a family, betray someone, become a local leader, or otherwise develop independently.

The AI must not equate "minor NPC" with "non-simulated".

Default AI-world classification:
- sapient/socially agentic persistent NPC -> `entity`;
- generic animal or ambient wildlife -> `detail` / non-simulated;
- temporary summon, disposable combat spawn, illusion, swarm fragment or other short-lived technical actor -> `disabled`;
- a normally non-sapient creature may be explicitly promoted to `entity` only when canon establishes it as an individually persistent actor with meaningful agency.

Examples:
- random surviving goblin -> entity;
- unnamed but persistent dock worker -> entity;
- generic wolf in the forest -> detail/non-simulated;
- named bonded wolf with established ongoing agency -> may be entity;
- summoned wolf -> disabled.

The goal is not to protect the story from insignificant characters becoming important. The goal is to let that happen naturally while excluding actors that do not possess a meaningful independent life.

For locations, hierarchy depth does not determine eligibility. A tavern may be a child of a district and still be a whole simulation unit. A room, toilet, staircase, corridor, individual table, closet or similar interior fragment is not independently simulated just because it was represented in the location tree.

Add an explicit background classification used by AI-world generation for locations and persistent NPCs:

- `background_simulation_scope='entity'` — independently eligible for Resolver selection;
- `background_simulation_scope='detail'` — part of another simulated thing / ambient actor; never selected independently;
- `background_simulation_scope='disabled'` — technical, temporary or intentionally excluded.

Creation/materialization policy:
- places with their own identity, ongoing state and ability to change independently are locations with `entity`;
- internal descriptive areas should normally be `location_sections` of the parent;
- if an internal area must technically exist as a child `location`, mark it `detail`;
- do not infer simulation-unit status from `parent_location_id` alone.

Examples:
- city -> entity;
- port district -> entity;
- tavern -> entity;
- tavern kitchen as a meaningful independently tracked establishment area -> usually detail unless explicitly promoted;
- tavern room -> detail;
- tavern toilet -> detail.

A background event on a tavern may change its rooms, staff or interior description as consequences, but those parts do not receive independent daily selection rolls.

### 3. d100 sets direction and magnitude, not literal prose

Default severity bands:

| Roll | Meaning |
|---|---|
| 1 | critical negative |
| 2-5 | severe negative |
| 6-15 | notable negative |
| 16-35 | minor negative |
| 36-65 | neutral / mundane / no meaningful change |
| 66-85 | minor positive |
| 86-95 | notable positive |
| 96-99 | severe positive |
| 100 | critical positive |

A critical result is permission for a rare large event, not an instruction to force one specific cliché.

Examples:
- NPC roll 1 can mean death, serious illness, imprisonment, ruin, disappearance, betrayal, etc. **only when plausible in canon**.
- NPC roll 100 can mean major success, wealth, fulfilled ambition, promotion, reconciliation, discovery, etc. **only when plausible in canon**.
- If death or another irreversible result would break a protected active quest contract, Flash must choose another event of equivalent severity or create a recoverable complication.
- Rolls 36-65 may legitimately produce no lasting event.

The same principle applies to locations and the world-wide event.

### 4. World event first, entities second

Each campaign day has one global world d100.

Flash first interprets that roll as a compact world-level development.

Then selected NPC/location events are interpreted in that already-established daily context.

This allows one world event to have coherent downstream effects without forcing them:
- new tax -> merchant pressure;
- storm -> port damage;
- festival -> trade and crowd changes;
- political tension -> guards become more active.

Entity rolls still decide whether that particular entity benefits, suffers, or barely changes.

### 5. Development can continue existing threads

Flash receives the entity's current compact background summary before producing a new event.

It should prefer a logical continuation when appropriate instead of spawning unrelated trivia.

Bad:
- day 4: shop robbed;
- day 5: owner catches a cold;
- day 6: owner finds a dog.

Better:
- shop robbed;
- creditors pressure the owner;
- later a city-guard contract helps recovery.

Randomness changes direction. It does not erase causality.

## World Resolver contract

Introduce an internal server boundary tentatively named `world-random-resolver`.

### Automatic roll

Server API:

```ts
resolveWorldRoll({
  campaignId,
  campaignDay,
  scope: "world" | "npc" | "location",
  entityId,
  decisionKey,
  sides: 100,
})
```

Result:

```json
{
  "decision_key": "day:14:npc:<uuid>:daily",
  "sides": 100,
  "roll": 23,
  "created_at": "...",
  "idempotent_replay": false
}
```

Same `decision_key` must always return the stored original result.

### AI-requested random decision

Tool contract:

```json
{
  "name": "resolve_random_decision",
  "arguments": {
    "decision_key": "day:14:npc:<uuid>:career_direction",
    "question": "What happens to the merchant's attempt to recover?",
    "sides": 100,
    "bands": [
      {"min": 1, "max": 30, "key": "fails"},
      {"min": 31, "max": 70, "key": "stagnates"},
      {"min": 71, "max": 100, "key": "succeeds"}
    ]
  }
}
```

Rules:
- bands are supplied **before** the model sees the roll;
- bands must be non-overlapping and within 1..sides;
- server returns roll + matched key;
- duplicate decision key replays the same stored result;
- no "reroll" tool exists;
- every roll is audit-linked to the daily run / entity event.

This tool should eventually be reusable by the primary GM for genuine uncertain narrative branches, but the first integration target is background Flash.

## Daily run

Resolver sequence for one game day:

1. Load only eligible **simulation units**.
2. Apply server-side 30% selection independently to NPC units and location units.
3. Roll the global world d100.
4. Roll one d100 for every selected unit.
5. Persist selection and rolls before any model call.
6. Build the compact selected-entity packet.
7. Call DeepSeek V4.1 Flash once with that packet.
8. Persist Flash interpretation as background events/snapshots.

Flash never receives the full candidate pool.

Proposed table:

### `ai_background_daily_runs`

- `id uuid pk`
- `campaign_id uuid`
- `campaign_day integer`
- `status queued|running|completed|failed`
- `world_roll smallint`
- `worker_model_id uuid`
- `candidate_counts jsonb`
- `selected_counts jsonb`
- `result jsonb`
- timestamps

Unique: `(campaign_id, campaign_day)`.

One daily run can therefore never execute twice.

### `ai_background_rolls`

- `id uuid pk`
- `run_id uuid`
- `campaign_id uuid`
- `campaign_day integer`
- `scope world|npc|location|decision`
- `entity_id uuid nullable`
- `decision_key text`
- `sides integer`
- `roll integer`
- `bands jsonb nullable`
- `matched_key text nullable`
- timestamps

Unique: `(campaign_id, decision_key)`.

### `ai_background_events`

Immutable event ledger.

- `id uuid pk`
- `run_id uuid`
- `campaign_id uuid`
- `effective_game_day integer`
- `scope world|npc|location`
- `entity_id uuid nullable`
- `roll_id uuid`
- `severity text`
- `title text`
- `summary text` — normally 1-2 lines
- `effect_kind text`
- `effect_payload jsonb`
- `provenance jsonb`
- `created_at`

This is historical truth and is never repeatedly injected wholesale into GM context.

### Location simulation classification

Add to `public.locations`:

- `background_simulation_scope text not null`
- allowed values: `entity|detail|disabled`

New AI-world materialization must always set this deliberately. The world materializer prompt must prefer `location_sections` for interior details and reserve child locations for navigable/canonical places. A child location still requires an explicit scope.

Candidate selection queries include only `background_simulation_scope='entity'`.

### `ai_background_entity_snapshots`

Versioned compact state, not an append-only list of prose facts.

- `id uuid pk`
- `campaign_id uuid`
- `scope world|npc|location`
- `entity_id uuid nullable`
- `through_game_day integer`
- `summary text`
- `state jsonb`
- `source_event_ids uuid[]`
- `worker_model_id uuid`
- timestamps

For a player at game day D, context selects the newest snapshot with
`through_game_day <= D`.

This is what prevents future information leaking to a split party that is still on an earlier day.

## Temporal rule for split parties

Current Stage 8 dawn is location-scoped. Different groups may be on different game days.

Therefore background simulation MUST NOT blindly patch canonical base tables on the first dawn of a future day.

V1 rule:

1. First arrival at game day D reserves the unique daily run D.
2. The run produces immutable background events with `effective_game_day=D`.
3. It produces versioned compact background snapshots.
4. Game-chat context only reads snapshots/events whose effective day is <= the source character's current game day.
5. Temporal-sensitive results (death, imprisonment, location destruction, relocation, etc.) are represented in the background overlay first.
6. Runtime context merges the overlay over base entity state for that player's day.
7. A later materialization bridge may persist a background effect into base canonical tables only when it is temporally safe and idempotent.

This avoids:
- a day-3 player seeing a day-5 death;
- duplicate daily simulation from two locations reaching dawn;
- irreversible base-table mutations leaking backward in time.

## Flash worker input

One batch request per game day.

Input is deliberately compact and already filtered by Resolver. There is no candidate-selection decision left for Flash to make.

```json
{
  "campaign_day": 14,
  "world": {
    "roll": 18,
    "current_summary": "..."
  },
  "npcs": [
    {
      "id": "...",
      "name": "...",
      "roll": 73,
      "current_summary": "...",
      "profile": {"role":"merchant","motivation":"..."},
      "recent_relevant_facts": ["..."],
      "protected_constraints": ["active quest target"]
    }
  ],
  "locations": [
    {
      "id": "...",
      "name": "...",
      "roll": 8,
      "current_summary": "...",
      "summary": "...",
      "protected_constraints": []
    }
  ]
}
```

Do NOT send:
- entire campaign history;
- all 50 chat messages for every entity;
- all NPC sheets;
- all location sections;
- old daily event lists.

Only current compact state + narrowly relevant canon.

## Flash worker output

Strict JSON:

```json
{
  "world_event": {
    "severity": "minor_negative",
    "title": "...",
    "summary": "...",
    "effect_kind": "narrative",
    "effect_payload": {}
  },
  "npc_events": [
    {
      "entity_id": "...",
      "severity": "minor_positive",
      "title": "...",
      "summary": "...",
      "effect_kind": "profile_overlay",
      "effect_payload": {},
      "merged_summary": "..."
    }
  ],
  "location_events": []
}
```

The worker may call `resolve_random_decision` during the run when a real branch remains undecided.

It may not request a new daily severity roll; those are already supplied by the server.

## Fact compaction

Background simulation does **not** append one active `campaign_memory_fact` for every daily event.

Instead:

```text
old compact snapshot
        +
new background event
        ↓
Flash merge
        ↓
new compact snapshot
```

Historical events remain in `ai_background_events` and may also be mirrored into
`campaign_events` for timeline/audit/search.

The primary GM normally receives only:
- current applicable world snapshot;
- current applicable snapshot for present/relevant NPCs;
- current applicable snapshot for the source location;
- at most a few high-importance recent background events.

This prevents background chatter from consuming the existing memory budget
(`MAX_MEMORY_FACTS=24`, `MAX_MEMORY_SUMMARIES=8`).

## Interaction with existing 45-message maintenance

Keep the systems separate.

### 45-message worker

Purpose:
- reconcile what happened in played scenes;
- derive facts from GM/NPC/gameplay evidence;
- synchronize already-confirmed state.

### Background simulation

Purpose:
- make off-screen world state evolve;
- use server randomness;
- create new independent developments.

The 45-message worker must not re-invent background events. Provenance tags should allow it to recognize them as already canonical background evidence.

## Overload guards

Hard limits for V1:

- only AI-world campaigns; human-run campaigns are unaffected and human GMs continue to decide their own world evolution;
- one batch model call per campaign game-day under normal operation;
- 30% expected inclusion chance separately for eligible NPCs and locations;
- neutral results can yield no event;
- max extra resolver decisions per selected entity: 2;
- max total resolver decisions per daily run: 24;
- no images generated by background simulation;
- no bulk entity creation from background simulation;
- no new quest creation unless an existing background thread explicitly escalates and a later dedicated design allows it;
- no direct PC state changes;
- no direct player inventory changes;
- critical irreversible outcomes require plausibility + protection checks.

## Suggested implementation stages

### Stage 1 — Resolver + schema

- create daily run / rolls / events / snapshot tables;
- add explicit AI-world `background_simulation_scope=entity|detail|disabled` classification for locations and persistent NPCs;
- update world materializer contract so whole places become `entity`, interior fragments normally become sections/`detail`, and persistent agentic NPCs default to `entity` regardless of initial narrative importance;
- AI-world-only guards;
- idempotent server `resolve_world_random_v1`;
- cryptographically unbiased dN roll;
- decision-band validation;
- tests for replay and boundaries.

### Stage 2 — Daily Resolver selection

- detect first arrival to new campaign day;
- reserve one daily run;
- build eligible NPC + location **simulation-unit** sets;
- Resolver performs server-side 30% selection;
- cooldown/stale weighting is applied before the final bounded selection probability;
- Resolver pre-rolls d100 for world + every selected entity;
- persist selection and all daily rolls before calling Flash;
- Flash receives selected entities only.

### Stage 3 — Flash background worker

- fixed `deepseek-v4.1-flash`;
- one batched prompt;
- strict output validation;
- `resolve_random_decision` tool;
- store immutable events.

### Stage 4 — Compact snapshot merger

- old snapshot + new event -> replacement compact snapshot;
- keep immutable event history;
- no daily memory-fact spam.

### Stage 5 — Temporal context overlay

- load latest snapshot at `through_game_day <= source current day`;
- expose world/source-location/present-NPC background state to primary GM;
- hide future events from lagging split-party players;
- filter temporal life/location overlays from NPC runtime/presence where necessary.

### Stage 6 — Materialization bridge

- convert temporally safe background overlays into base canonical changes when required;
- idempotent receipts;
- never overwrite newer player/GM-driven state.

### Stage 7 — Certification

- split-party time tests;
- two simultaneous dawns cannot create duplicate daily run;
- same resolver decision cannot reroll;
- 1/100 critical guard tests;
- neutral roll can no-op;
- background events do not inflate GM context over long campaigns;
- normal human-run campaigns remain untouched.

## Locked product decision

The world is not deterministic just because an LLM prefers the statistically most plausible continuation.

When a situation has multiple reasonable possible developments, the AI should use the resolver rather than silently choosing its favorite.

**Daily world simulation: Resolver selects. Resolver rolls. Flash interprets.**

**Additional uncertain branch: Model proposes the question and outcome space. Resolver rolls. Model obeys.**
