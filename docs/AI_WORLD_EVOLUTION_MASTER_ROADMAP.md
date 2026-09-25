# AI World Evolution — Master Implementation Roadmap

> Status: **DESIGN LOCKED**
>
> Scope: experimental AI-world campaigns only.
>
> **Executable source of truth for implementation status:** `src/ai-world-evolution/contract.ts`.
>
> A stage is NOT complete because similar infrastructure exists. The code contract lists, for every stage, its purpose, existing foundation, explicit `notSatisfiedBy` shortcuts, required artifacts, acceptance criteria and certification checks. Stage status must be advanced deliberately only after those requirements exist.

> This is the single implementation roadmap for:
> - background world simulation;
> - server-owned random Resolver;
> - daily world/NPC/location evolution;
> - compact long-term state;
> - split-party temporal safety;
> - bestiary-backed anonymous scene actors;
> - promotion of named actors into persistent NPCs;
> - future use of Resolver by AI GM for uncertain narrative decisions.

# Product model

The AI world has three distinct layers.

```text
PRIMARY AI GM
runs the current scene
        │
        ├──── asks World Resolver for genuine uncertain choices
        │
        ▼
WORLD RESOLVER
owns randomness + daily entity selection
        │
        ▼
DEEPSEEK V4.1 FLASH
cheap background/world worker
interprets already-resolved rolls
        │
        ▼
CANON + COMPACT TEMPORAL STATE
```

The model does not own randomness.

For daily evolution:

```text
new game day
  ↓
Resolver builds eligible whole-entity pool
  ↓
Resolver selects ~30% independently
  ↓
Resolver rolls world d100 + entity d100s
  ↓
Flash receives ONLY selected entities + rolls
  ↓
Flash interprets consequences
  ↓
events + compact snapshots
  ↓
primary GM sees only relevant current state
```

For anonymous creatures:

```text
bestiary
  ↓
ephemeral scene actor
  ↓
fight / talk / flee / survive
  ↓
real personal name is revealed
  ↓
promotion
  ↓
persistent NPC
  ↓
eligible for background simulation
```

# Locked rules

## Randomness

- Resolver chooses entities, not Flash.
- Resolver rolls all daily d100s, not Flash.
- AI may request an extra random decision only by declaring the decision and outcome bands before seeing the result.
- Same decision key cannot reroll.
- All rolls are persisted/auditable.

## Daily entity coverage

- one global world d100 every new campaign game day;
- each eligible persistent NPC gets an independent default 30% inclusion chance;
- each eligible whole location gets an independent default 30% inclusion chance;
- selected entities each receive their own d100;
- 30% is probabilistic coverage, not an exact quota.

## Severity

Default d100 interpretation:

- 1 critical negative;
- 2–5 severe negative;
- 6–15 notable negative;
- 16–35 minor negative;
- 36–65 neutral/mundane/no lasting change;
- 66–85 minor positive;
- 86–95 notable positive;
- 96–99 severe positive;
- 100 critical positive.

A roll determines direction and magnitude, not a literal cliché.

## Whole entities only

Location hierarchy depth does not define simulation eligibility.

Eligible examples:
- city;
- district;
- port;
- tavern;
- temple;
- mine;
- castle.

Non-independent details:
- tavern room;
- toilet;
- corridor;
- staircase;
- individual table;
- closet.

Use explicit `background_simulation_scope=entity|detail|disabled`.

Interior details should normally be location sections rather than separate simulated locations.

## NPC identity

Narrative importance is irrelevant.

A persistent named goblin can grow into an important character.

But no permanent card is created for:
- Бандит 1;
- Бандит 2;
- Стражник у ворот;
- generic unnamed combatant.

Anonymous mechanically active creatures are ephemeral scene actors backed by the bestiary.

A persistent NPC appears after a real personal name is revealed to the player or the GM explicitly commits to revealing it in that same turn.

## Memory

Do not append endless active facts.

Each persistent simulated entity has:
- immutable historical background events;
- a compact versioned current summary/state.

New event:

```text
old compact state + new event -> new compact state
```

The old history stays in the event ledger but is not injected wholesale into GM context.

## Split-party time

Background events have an effective game day.

A player on day 3 cannot see state from day 5.

Irreversible future events must not leak backward through canonical base rows.

# Master roadmap

## Stage 1 — World Resolver foundation

**Status: CERTIFIED — 2026-09-23**

Build the server-owned randomness boundary.

Implement:

- cryptographically unbiased dN rolling;
- persistent decision keys;
- idempotent replay;
- decision-band validation;
- roll audit/provenance;
- AI-world-only guard.

Core operation:

`resolve_world_random_v1`

Supports:
- daily world d100;
- daily NPC/location d100;
- additional AI-requested random decisions.

No reroll operation exists.

Tests:
- same decision key returns same result;
- invalid bands rejected;
- values always in bounds;
- normal campaigns cannot use it.

**Done when:** randomness has one authoritative server owner.

---

## Stage 2 — Background simulation schema

**Status: CERTIFIED — 2026-09-23**

Create the persistent background runtime.

Tables/structures:

### `ai_background_daily_runs`
Unique by `campaign_id + campaign_day`.

Tracks:
- queued/running/completed/failed;
- world roll;
- counts;
- worker model;
- output/audit.

### `ai_background_rolls`
Stores:
- decision key;
- target scope/entity;
- sides/result;
- bands/matched outcome;
- run/day provenance.

### `ai_background_events`
Immutable historical event ledger.

### `ai_background_entity_snapshots`
Versioned compact state by game day.

Entity/detail/disabled simulation classification remains exclusively **Stage 3** under the executable contract; Stage 2 only establishes temporal-safe storage and read boundaries.

Tests:
- duplicate day run impossible;
- future snapshot versions coexist safely;
- reads enforce `effective_game_day/through_game_day <= source_game_day`;
- normal campaigns cannot create rows.

**Done when:** storage can represent world evolution without touching live canon incorrectly.

---

## Stage 3 — Generation-time entity classification

**Status: CERTIFIED — 2026-09-23**

Update AI-world materialization so new content is classified correctly immediately.

Locations:
- whole independently evolving place -> `entity`;
- interior fragment -> section or `detail`;
- technical/temporary -> `disabled`.

Persistent NPCs:
- named persistent agentic character -> `entity`;
- temporary/technical actor -> not persistent;
- ordinary animals/ambient wildlife do not automatically enter background simulation;
- an individually established persistent animal/creature may be promoted deliberately.

Hard rule:
- world builder must not create `Бандит 1`, `Бандит 2`, etc. as permanent NPCs.

Tests:
- tavern can be entity even when child of city;
- tavern room is not independently simulated;
- named persistent goblin is eligible;
- unnamed extra is not materialized as world NPC.

**Done when:** future AI-generated world state is born clean instead of requiring later archaeology.

---

## Stage 4 — Shared bestiary runtime compiler

**Status: CERTIFIED — 2026-09-23**

Refactor existing Stage 6 NPC bestiary compilation into one shared authoritative compiler.

Input:
- `bestiary_catalog` stat block.

Output:
- attributes;
- HP/AC;
- saves/skills;
- actions;
- reactions;
- save actions;
- damage;
- limited-use resources;
- recharge metadata.

Both use the same compiler:
- persistent canonical NPCs;
- ephemeral scene actors.

Existing Stage 6 behavior must remain equivalent.

Tests compare old canonical NPC results against the refactored compiler.

**Done when:** there is exactly one interpretation of a bestiary stat block.

---

## Stage 5 — Ephemeral bestiary scene actors

**Status: CERTIFIED — 2026-09-23**

Create `ai_scene_actors`.

Actor stores only per-instance mutable runtime:

- campaign/room/location;
- bestiary source;
- display label;
- temporary runtime ordinal if needed;
- HP;
- life state;
- conditions;
- resources;
- mechanics snapshot;
- game day/period;
- identity state;
- revealed name;
- optional promoted NPC id.

Implement:

- spawn one or N actors from a bestiary slug;
- list active actors for room/context;
- archive/remove actors.

Example:

Three bandits =
- 3 scene actor UUIDs;
- same bestiary definition;
- independent HP/resources;
- zero permanent character cards.

**Done when:** AI can populate a scene mechanically without polluting the world database.

---

## Stage 6 — Scene actor combat/runtime execution

**Status: CERTIFIED — 2026-09-23**

Generalize the existing NPC execution pipeline.

Actor reference becomes either:

```ts
{ kind: "npc", characterId }
{ kind: "scene_actor", actorId }
```

Scene actors must support:

- attacks;
- save actions;
- ability/skill rolls where needed;
- resource consumption;
- damage;
- conditions;
- death;
- flee/remove;
- player hard-wait saves.

The AI chooses legal intent/action.
The server owns:
- numbers;
- DCs;
- attack modifiers;
- damage dice;
- resource costs;
- random rolls.

Tests:
- identical bandits have independent HP;
- one actor consuming an ability does not consume another's;
- AI cannot forge mechanics.

**Done when:** anonymous actors are full gameplay actors.

---

## Stage 7 — AI GM scene-actor integration

**Status: CERTIFIED — 2026-09-23**

Expose narrow AI-world tools to the primary GM/runtime:

- spawn scene actor(s);
- read current scene actors;
- execute legal actor action;
- update narrow validated state such as flee/remove when appropriate.

Prompt contract:

- unnamed extras -> scene actors;
- no permanent NPC card;
- no fake numbered names;
- use bestiary mechanics;
- permanent NPC only after identity reveal.

World materializer remains responsible for persistent canon, not disposable encounter mobs.

**Done when:** normal AI play naturally uses temporary actors without manual intervention.

---

## Stage 8 — Scene actor promotion

**Status: CERTIFIED — 2026-09-23**

Implement transactional:

`promote_scene_actor_to_npc`

When a real personal name becomes known:

1. lock actor;
2. return existing promoted NPC if already promoted;
3. create one canonical published NPC;
4. carry over bestiary provenance;
5. carry over current/max HP;
6. carry over resources/conditions that should persist;
7. carry over location and game time;
8. attach/create NPC profile;
9. build canonical NPC runtime from same bestiary source;
10. create player discovery for characters who learned the identity;
11. link actor -> canonical character;
12. mark actor promoted.

Example:

`Гоблин (3/7 HP) -> "Я Ург" -> Ург (3/7 HP)`.

No fresh healthy duplicate.

**Done when:** temporary characters can organically become real world characters.

---

## Stage 9 — Daily candidate Resolver

**Status: CERTIFIED — 2026-09-23**

Build one idempotent daily simulation reservation per campaign game day.

Determine campaign frontier day:
- the first scene/player reaching day D may reserve day D simulation;
- only one run exists for D.

Resolver builds candidate pools:

NPCs:
- persistent;
- simulation-eligible;
- not technical/ephemeral;
- respect active hard transitions/protection.

Locations:
- `background_simulation_scope='entity'`;
- not archived/deleted.

Selection:
- base independent 30%;
- optionally bounded cooldown/recent/stale weighting;
- no exact quota;
- Flash does not see rejected candidates.

Then Resolver pre-rolls:
- one world d100;
- one d100 per selected NPC;
- one d100 per selected location.

Persist all selection + rolls before model invocation.

**Done when:** Flash receives a finished random sample instead of choosing its own playground.

---

## Stage 10 — DeepSeek Flash background worker

**Status: CERTIFIED — 2026-09-23**

Fixed worker:
`deepseek-v4.1-flash`.

One normal batch call per new game day.

Input only:
- game day;
- world d100 + compact world state;
- selected NPCs + d100 + compact current states + narrow canon;
- selected locations + d100 + compact current states;
- quest/protection constraints.

Do NOT send:
- all campaign history;
- full 50-message chat;
- all NPCs;
- all locations;
- rejected candidates.

Flash duties:
- interpret each supplied roll;
- continue existing threads where logical;
- generate 1–2 line event summaries;
- return structured effect payloads;
- merge proposed compact state.

Flash cannot:
- change supplied roll;
- choose a replacement entity;
- request reroll of daily severity;
- create bulk world content;
- mutate PCs directly.

**Done when:** selected world entities evolve cheaply and coherently.

---

## Stage 11 — Resolver-driven narrative branching

**Status: CERTIFIED — 2026-09-23**

Add `resolve_random_decision` to Flash first, then the primary GM.

Use when several plausible developments exist and no canonical reason determines one.

Flow:

1. model states the question;
2. model defines outcome bands before seeing result;
3. Resolver validates bands;
4. Resolver rolls;
5. result is persisted;
6. model continues from matched outcome.

Example:

```text
Will merchant recover from robbery?
1–30 fail
31–70 stagnate
71–100 recover
```

Resolver returns 84 -> recover.

No silent model choice.
No reroll.

Primary GM should use this for genuinely uncertain world/narrative outcomes, not for:
- already resolved rules;
- player rolls;
- obvious deterministic consequences.

**Done when:** AI stops defaulting every uncertain story branch to its statistically bland favorite.

---

## Stage 12 — Compact state merger

**Status: CERTIFIED — 2026-09-24**

For every world/NPC/location background event:

```text
previous applicable snapshot
+
new event
=
new snapshot
```

Persist:
- immutable event;
- new versioned compact snapshot.

Do not create one active memory fact for every daily event.

Background summary should capture:
- current meaningful state;
- unresolved ongoing thread;
- important consequences;
- no repetitive historical diary.

Historical events remain queryable separately.

**Done when:** a 200-day campaign does not create a 200-item prompt history per NPC.

---

## Stage 13 — Temporal overlay for split parties

**Status: CERTIFIED — 2026-09-24**

Integrate background snapshots into game-chat context by source character/scene game day.

Context rule:

`through_game_day <= current_scene_day`

Primary GM receives:
- current applicable world summary;
- current applicable source-location summary;
- relevant present/referenced NPC summaries;
- only a few recent high-importance events.

Never expose future snapshot/state to a lagging group.

Fix current long-term-memory behavior so future game-day events are excluded rather than receiving age 0.

Irreversible background effects initially remain temporal overlays when necessary:
- death;
- imprisonment;
- relocation;
- destruction;
- other state that could leak backward.

**Done when:** split parties can exist on different days without seeing each other's future.

---

## Stage 14 — Safe canonical materialization bridge

**Status: CERTIFIED — 2026-09-24**

Some background events eventually need to alter base canonical state.

Examples:
- NPC genuinely died;
- NPC changed location;
- faction membership changed;
- location closed/destroyed;
- relationship state changed.

Build an idempotent materialization bridge.

Requirements:
- apply only when temporally safe;
- never overwrite newer player/GM-driven changes;
- provenance ties canonical mutation to background event;
- one event materializes once;
- protected quest/state invariants remain respected.

Where immediate base mutation is unsafe, runtime continues to use temporal overlay until safe.

**Done when:** background history can become real mechanics without time-travel bugs.

---

## Stage 15 — Background simulation handoff for promoted actors

**Status: CERTIFIED — 2026-09-24**

After scene-actor promotion:

- default appropriate persistent named NPCs to simulation-eligible;
- exclude old ephemeral actor row from Resolver;
- preserve provenance from scene actor -> NPC;
- carry relevant encounter history into the NPC compact state.

A random goblin can therefore:

```text
appear unnamed
→ survive fight
→ reveal "Ург"
→ become persistent
→ disappear from player's life
→ be selected by Resolver days later
→ join mercenaries
→ eventually become captain
```

No special importance flag is required.

**Done when:** scene accidents can organically become long-running world stories.

### Cooperative temporal convergence addendum

When active player characters physically converge while their personal game clocks differ:

- the shared scene advances to the latest colocated `campaign_day/day_period`;
- lagging PCs receive an immutable `idle_life` catch-up receipt;
- catch-up means ordinary life, routine and uneventful downtime;
- a PC may have attempted something during the skipped interval, but no meaningful success exists without separate canonical evidence;
- catch-up itself never grants rewards, quest progress, resources, relationships, discoveries or heroic accomplishments;
- once converged, the PCs share one scene clock and can continue playing together normally.

This is AI-world-only and does not change human-GM campaigns.

**Certified when:** day-3/day-5 colocated PCs converge to day 5, mechanics remain unchanged, and the catch-up is recorded as non-meaningful idle time.

---

## Stage 16 — Cleanup and retention

**Status: CERTIFIED — 2026-09-24**

Scene actors:
- active while referenced by live scene;
- dead/fled/removed retained for encounter audit;
- full runtime retained for 14 game days after the actor's scene, measured against the lagging active-player safe day;
- after the safe horizon, heavy sheet/mechanics/conditions/effects/resources are compacted into a bounded `retention_summary`;
- command and damage receipts remain as encounter audit;
- promoted actor keeps lightweight redirect/provenance and may compact only after its Stage 15 handoff snapshot exists;
- active actors are never compacted;
- compaction is idempotent and automatically retried as player game time advances.

Background:
- immutable events remain retained;
- snapshots remain versioned;
- obsolete prompt material is not loaded routinely.

Do not delete permanent promoted NPC state.

**Done when:** long campaigns remain operationally small without losing encounter audit, promotion redirects or canonical promoted-NPC state.

---

## Stage 17 — Canon-bound intent adjudication and delegated real player rolls

**Status: CERTIFIED — 2026-09-24**

The primary GM does **not** need to know Supabase RPC names, UI implementation details or the application's roll API.

Its job is fictional/mechanical judgment:

1. understand what the player is trying to do;
2. decide whether the result is already deterministic;
3. decide whether world existence is actually established;
4. if a real character check is needed, state the semantic check and logical difficulty;
5. a smaller mechanic worker translates that directive into the existing real server roll request.

This must support ordinary D&D-style checks from context, not only authored buttons.

Examples:
- exceptionally strong alcohol -> Constitution check/save when consequences are uncertain;
- sprinting/climbing/swimming under pressure -> Athletics/Strength;
- reading a suspicious NPC -> Insight;
- tracking -> Survival;
- spotting hidden detail -> Perception;
- recalling plausible lore -> appropriate Intelligence check;
- any other normal check the GM can logically justify.

The primary GM may provide the exact skill/save when obvious. The junior mechanic worker may normalize/infer the exact canonical mechanic from the character sheet and server rules. The server remains authoritative for modifier calculation.

### World existence is not a skill check

Player d20 answers how well the character performs an action.

It does **not** manufacture an unstated hut, dragon, NPC, treasure or clue into existence.

Before the real d20, persist an adjudication mode:

- `deterministic_success`;
- `deterministic_failure`;
- `check`;
- `impossible_exact`.

If existence is genuinely unresolved and the world can logically contain either outcome, Stage 11 Resolver settles existence first. Only then may a character check determine whether the character finds/interacts with what now exists.

Natural 20 on `impossible_exact` can only reach a **precommitted partial-success envelope**. It cannot turn the exact impossible request into truth.

### Frozen before the die

Before the player sees the roll request, persist:
- source player intent/fingerprint;
- evidence/context fingerprint;
- adjudication mode;
- exact-goal permission;
- semantic mechanic request;
- normalized mechanic selected by junior worker;
- DC + visibility where applicable;
- natural-20 policy;
- success/failure/partial envelopes.

After the d20 exists, these fields are immutable.

**Implementation closure — 2026-09-24:** Stage 17 now uses the service-only `create_ai_gm_player_roll_request_v4` and `record_ai_gm_deterministic_adjudication_v2` entrypoints. World-discovery canonical evidence is server-checked against the current source scene/context instead of accepting any campaign UUID. Catalog-only item definitions cannot prove physical scene existence. Pending-roll replay must match the already frozen adjudication contract exactly or fails closed. Legacy v1/v3 roll entrypoints and deterministic v1 are no longer executable by `service_role`.

**Certification closure:** after the clean Stage 18 rebuild, a rollback-only integration smoke created a real Stage 17 Constitution check, resolved the server d20 through `resolve_player_roll_request_v1`, produced the roll chat message through the new gate, marked the request resolved and returned the same GM job to `queued` with `resume_chat_message_id`. The old Stage 18 requested-roll blocker is gone.

**Done when:** the GM can ask for any sensible D&D-style check from fiction, a junior mechanic worker creates the real app check, and neither the model nor the roll can invent canon or move the DC after seeing the result.

Detailed spec:
`docs/AI_WORLD_EVOLUTION_STAGE17_LOGIC_ROLLS.md`

---

## Stage 18 — Post-response junior world commit and turn gate

**Status: IMPLEMENTED — 2026-09-24**

This changes the current ordering.

Current runtime can run world materialization before the final visible reply. Stage 18 intentionally reverses that for nonessential world bookkeeping.

### Target turn pipeline

```text
Player sends a turn
        |
        v
Primary GM receives clean bounded context
        |
        +--> if a real roll is needed:
        |      semantic roll directive
        |            |
        |            v
        |      junior mechanic worker
        |            |
        |            v
        |      real pending_player_roll_request
        |            |
        |      player may roll, but may not send a new free-form turn
        |            |
        |            v
        |      same GM turn resumes with server result
        |
        v
GM final visible answer is published
        |
        +--> hidden post_turn_intents are persisted
        |
        v
Player can immediately read/open UI/etc.
Chat send is server-gated
UI: "Младший шуршит…"
        |
        v
Junior world worker creates/updates canonical state
NPCs / locations / quests / memory / bindings / other declared effects
        |
        v
commit receipt
        |
        v
turn gate opens
        |
        v
next player message accepted
```

### Why

World bookkeeping should not add invisible latency before the player sees prose.

But the next player turn must never begin against state the previous answer already claimed existed but the database has not committed yet.

Therefore response visibility and turn readiness are two different states.

### Primary GM responsibilities

The primary GM produces:
- player-visible response;
- a bounded hidden `post_turn_intents` plan containing **what the already-written answer requires the world to commit**.

The hidden plan does not contain provider tool syntax.

Examples:
- “This answer introduced a named inn: make this location persistent.”
- “The guard finally gave his real name: promote/bind this NPC.”
- “The answer established that the bridge collapsed: update that location state.”
- “This quest fact became canonical: persist it.”

### Junior worker responsibilities

The junior worker:
- receives only the published answer, hidden intent list and narrow canonical context;
- has manager/quest/materialization tools;
- may implement only facts already established by the answer;
- may resolve identity references and choose the correct owner boundary;
- cannot rewrite the visible answer or add a new dramatic result after publication;
- writes idempotent receipts for each intent.

### Turn gate

While junior status is `pending/running`:
- UI send box is visibly disabled;
- UI explicitly says **«Младший шуршит…»**;
- server rejects a new free-form player message even if a modified client tries to send it.

Client locking alone does not count.

When a roll is pending, the allowed interaction is the requested roll only. That is not a new free-form turn.

If junior work fails:
- do not silently accept the next turn;
- bounded retry/recovery must exist;
- UI shows a recoverable synchronization failure instead of pretending the world is current.

### Implementation closure — 2026-09-24

Stage 18 was rebuilt from zero. The previous v1/v2 post-turn tables, RPCs and gate trigger were deleted before the new implementation was created.

The v3 implementation uses:
- `finalize_ai_gm_turn_v3` to publish the visible answer and create the durable post-turn gate in one database transaction;
- immutable per-intent receipts with commit + intent lease tokens;
- `execute_ai_gm_post_turn_mutation_v3` so the canonical mutation and receipt completion happen in the same PostgreSQL transaction;
- a server gate that rejects free-form PC chat while a post-turn commit is queued/running/failed;
- an explicit `meganot.ai_gm_requested_roll` exception so the Stage 17 requested d20 remains usable while the GM is waiting for that roll;
- bounded retries and manager recovery while failed synchronization keeps the next free-form turn locked;
- terminal completed commits that cannot be changed back to queued/failed by downstream wake errors;
- client status from `get_ai_gm_room_status_v3`, including **«Младший шуршит…»**, durable worker wake-up and a recovery control for managers.

A rollback-only transactional smoke test proved: answer publication, atomic parent completion, post-turn input lock, atomic mutation+receipt, terminal completion, unlock after completion, free-form blocking during `waiting_for_user`, and requested-roll gate bypass.

**Done when:** response latency is dominated by the GM, bookkeeping happens while the player is reading, and the next message is impossible until canonical state has caught up.

---

## Stage 19 — Bounded clean GM context

**Status: IMPLEMENTED — 2026-09-24**

The existing runtime already has:

```ts
CHAT_CONTEXT_LIMIT = 50
MAX_MEMORY_FACTS = 24
MAX_MEMORY_SUMMARIES = 8
```

Keep that principle, but make the projection stricter.

### Primary GM receives

Raw conversational history:
- latest **up to 50** messages relevant/visible to this source PC and scene;
- player speech/actions;
- GM narration;
- NPC dialogue;
- compact player-visible roll/action results.

Separate compact canon:
- current game day / period / source location;
- physically present relevant PCs/NPCs;
- relevant sheets/resources, not every sheet in the campaign;
- current NPC identity fingerprints;
- relevant relationships/factions/assets;
- active quest slice;
- bounded memory facts/summaries;
- current applicable background snapshots;
- GM behavior profile;
- participating-player director preferences;
- enabled content profile;
- recent cooperative catch-up information when relevant.

### Primary GM does NOT receive as chat history

- `agent_jobs` history;
- provider traces;
- junior tool calls;
- `create_location`, `create_npc` etc. command transcripts;
- hidden `post_turn_intents`;
- raw materializer prompts;
- previous tool-loop JSON;
- full background event history;
- all campaign NPCs/locations/quests;
- giant raw `event_payload` objects when a compact visible result is enough.

Worker commands belong to worker audit, not to narrative memory.

The next GM learns that an inn now exists because the canonical location loader returns the inn, **not because it rereads “tool: create_location {...}” from yesterday's turn**.

### Mechanical messages

Visible roll/action messages may stay in the last-50 history, but must be projected to a compact shape:
- who rolled;
- what check;
- d20/result/total;
- public DC only if it was public;
- outcome class when server-known.

Do not forward internal request/dispatch state that does not help storytelling.

### Long campaign behavior

50 recent messages are not long-term memory.

Important older events belong in:
- compact memory facts;
- summaries;
- quests;
- NPC fingerprint/evolving relationships;
- background snapshots;
- canonical world records.

The existing 45-message maintenance process remains responsible for archival summarization.

### Implementation closure — 2026-09-24

Stage 19 was rebuilt around a server-owned bounded context reader instead of filtering after a raw `LIMIT 50`.

The implementation now:
- applies audience, campaign-event visibility, current game-day and physical-scene eligibility **before** selecting the newest 50 messages;
- projects visible mechanical events into a compact narrative/mechanical shape instead of forwarding raw `event_payload`;
- never forwards `turn_command_id`, `turn_component`, provider/tool-loop state or junior bookkeeping as narrative history;
- keeps runtime-rich canon available to mechanics while giving the primary GM a separate compact prompt projection;
- bounds NPC runtime, sheets, resources, charged items, relationships, assets, factions, quests, long-term memory, background snapshots and cooperative catch-up data;
- caps recent-history JSON at 48 KB and the complete primary-GM context JSON at 160 KB with deterministic lower-priority canon trimming;
- records context byte/token telemetry on AI-GM jobs.

A rollback-only long-history smoke test inserted 561 sequential messages: 420 eligible scene messages, 100 private direct-PC messages not visible to the source PC, 40 future-day messages and the current source turn. The reader returned exactly 50 eligible messages, leaked 0 private messages, leaked 0 future messages and retained the current source turn.

**Done when:** a 500-turn campaign still sends roughly one screenful of recent dialogue plus bounded relevant canon, not a geological core sample of every tool call since creation.

---

## Stage 20 — Persistent NPC identity fingerprint

**Status: IMPLEMENTED — 2026-09-24**

Current `npc_profiles` has useful but insufficient fields:
- `demeanor`;
- `motivation`;
- notes;
- tags.

Those describe a sketch, not a durable person.

Create a dedicated **NPC Identity Fingerprint** for every persistent NPC.

### Stable identity core

At minimum:
- personality traits;
- weighted values;
- red lines / things they will not accept;
- long-term desires;
- fears;
- loyalties;
- attitude toward law/authority where meaningful;
- risk tolerance;
- violence threshold;
- behavior under pressure;
- self-image;
- social style / speech tendencies;
- decision priorities: what wins when values conflict.

Example conceptually:

```text
Traits: calculating, calm, vindictive
Values:
  family 5/5
  wealth 4/5
  law 1/5
Red lines:
  will not betray daughter
  will not accept public humiliation quietly
Fear:
  returning to poverty
Pressure:
  bargain -> threaten via connections -> fight only when cornered
Decision priority:
  family > survival > wealth > reputation > law
```

### Stable identity vs changing state

Do not mix:
- current mood;
- current HP;
- current location;
- current relationship score;
- temporary fear;
- recent anger;

into the stable fingerprint.

Relationship can go from -10 to +40 in a week while core personality stays the same.

Fingerprint evolution requires a **major canonical event** and version/provenance:
- traumatic loss;
- ideological conversion;
- betrayal that actually changes worldview;
- years of life change;
- similarly meaningful transformation.

Ordinary dialogue does not rewrite personality.

### Consumers

The exact same current fingerprint goes to:
- NPC dialogue generation;
- primary GM;
- background simulation;
- social intent adjudication.

This matters mechanically.

If a request directly violates a hard red line, Persuasion may be `impossible_exact` rather than DC 30 wish magic.

### UI

NPC card gets a GM-facing **«Личность»** section.

Private fingerprint fields are not automatically player-visible.

Player-observed traits can be exposed separately if actually discovered.

### Promotion

A scene actor that becomes a persistent named NPC receives a conservative initial fingerprint based on:
- behavior already established in the scene;
- bestiary/archetype context;
- explicit GM facts.

Do not invent an entire childhood merely because the goblin said his name was Ург.

### Implementation closure — 2026-09-24

Stage 20 now has a server-owned, versioned NPC identity layer rather than relying on `npc_profiles.demeanor` and `motivation`.

Implemented:
- `npc_identity_fingerprints` stores the current stable core for every persistent NPC;
- `npc_identity_fingerprint_versions` keeps immutable semantic versions;
- `npc_identity_evolution_receipts` proves explicit major-event changes;
- `npc_identity_observations` stores player-specific observed traits separately from GM-private identity;
- direct UPDATE of the current fingerprint is blocked; all semantic writes go through the versioned writer;
- mutable keys such as mood/HP/location/current relationship are rejected from the stable core schema;
- ordinary/minor events cannot evolve identity: the evolution RPC requires a canonical event with importance >= 4 that actually involves the NPC;
- promotion creates a conservative seeded fingerprint with scene-actor/bestiary provenance and explicitly records `conservative_no_unobserved_biography`;
- primary GM, NPC dialogue, Stage 17 social adjudication and background simulation consume the same current fingerprint;
- background worker output is forbidden from writing identity/personality fields into mutable snapshots;
- hard red lines are explicitly treated by the GM/social adjudicator as possible `impossible_exact`, not a giant Persuasion DC;
- world NPC dossier RPC v2 exposes full fingerprint only to GM/Admin and only player-specific observations to ordinary players;
- GM dossier UI has a dedicated **«Личность»** section with version, traits, weighted values, red lines, desires, fears, loyalties, authority/risk/violence axes, pressure behavior, self-image, social style and decision priorities.

Rollback-only database certification covered:
- direct-update rejection;
- unknown/mutable identity-key rejection;
- minor-event evolution rejection;
- major-event version + evolution receipt creation;
- explicit profile bootstrap into a second seeded version;
- GM/private dossier separation;
- scene actor -> named NPC promotion, including actor+bestiary provenance and zero invented traits/desires/red-lines.

**Done when:** the same NPC remains the same person in dialogue, off-screen life and social conflict months later.

---

## Stage 21 — GM behavior profiles

**Status: IMPLEMENTED — 2026-09-24**

Profiles change **how hard reality presses on the player**, not what reality is.

Shared constitution above every profile:

> Player intent is input, not canon.  
> The world exists independently of what the player wants to be true.  
> NPCs retain their own values, goals and agency.  
> A player can change the world only through a logical action/mechanic that actually causes change.  
> The GM itself is also bound by canon, mechanics and committed random outcomes.

### Жестокий

Meaning: **strict realism**, not “AI wants the player dead.”

Properties:
- minimal/no plot armor;
- strong persistent legal/social/economic consequences;
- power asymmetry is respected;
- world does not level-scale itself around the PC;
- stupid choices can lead to arrest, crippling loss or death;
- guards, factions, witnesses and institutions remember what happened;
- GM does not invent extra enemies/traps just to kill the PC;
- if several outcomes are equally logical, it does not bend toward rescue merely because the player is the protagonist.

Example:
attacking a professional city guard unit as a weak PC can simply be suicidal. The city does not forget a massacre because the encounter ended.

### Приключение

Still realistic, but prefers playable adventure among equally plausible branches:
- danger is telegraphed more often;
- escape/surrender/debt/rivalry/complication can be preferred to abrupt death when equally logical;
- hooks and useful coincidences are more common;
- consequences remain;
- NPCs still say no;
- canon does not bend simply to preserve a plot.

This should be the sensible default.

### Симс

Life-simulation-first:
- low density of unmotivated lethal escalation;
- daily life, work, housing, money, hobbies, friendships, dates, family and social conflict receive much more space;
- ordinary NPCs behave like people, not quest dispensers;
- rejection and failure remain normal;
- player wishes do not become NPC wishes;
- lethal consequences still happen when the player creates a genuinely lethal situation.

A PC in Симс can still die after attacking ten guards with a knife. The profile merely stops the universe from arranging ten guards with knives every breakfast.

### Internal dimensions

Do not encode profile behavior as one vague prompt adjective.

Persist normalized dimensions such as:
- consequence strictness;
- plot-armor allowance;
- lethal escalation pressure;
- danger telegraphing;
- recoverable-complication preference;
- adventure coincidence;
- life/social focus;
- pacing;
- persistence/forgetfulness of consequences.

### Implementation closure — 2026-09-24

Stage 21 now stores AI-GM behavior as fixed campaign-level presets instead of one vague prompt adjective.

Implemented:
- fixed presets `brutal / adventure / sims` with Russian labels **Жестокий / Приключение / Симс**;
- normalized 0..5 dimensions for consequence strictness, plot armor, lethal pressure, danger telegraphing, recoverable complications, adventure coincidence, life/social focus, pacing pressure and consequence persistence;
- a shared server-owned constitution stating that player intent is not canon and profiles cannot modify facts, resolved mechanics/dice or NPC identity/agency;
- **Приключение** is the default for AI-world campaigns;
- binding an `ai_world_slot` persists that default immediately; it is not only a runtime fallback;
- authenticated profile writes use `SECURITY INVOKER` + manager/AI-world RLS instead of an exposed authenticated `SECURITY DEFINER` mutation;
- profile changes are campaign-level, AI-world-only and require campaign-manager authority;
- primary GM receives the same selected profile in canonical context and is explicitly instructed to use it only as tie-breaking among already plausible branches;
- background simulation receives the same profile, while its validator still freezes the server-supplied d100 result/direction/magnitude;
- world materializer and post-turn junior remain outside profile discretion because they only materialize already published canon;
- GM job results record the selected profile key and dimensions for audit;
- the AI tools drawer exposes the three profiles for AI-world campaigns and explains that canon, dice and NPC personality remain unchanged.

Rollback-only smoke certification changed an existing campaign to AI-world only inside the test transaction, selected **Жестокий**, and verified:
- ordinary non-AI campaigns reject behavior-profile mutation;
- a non-manager player cannot change the campaign profile;
- all 9 normalized dimensions are present;
- NPC identity version/hash is unchanged;
- campaign event count is unchanged;
- temporary AI-slot binding is fully rolled back.

**Done when:** changing profile changes the campaign pressure while identical facts, NPC identity and resolved dice remain authoritative.

---

## Stage 22 — Player director preferences

**Status: IMPLEMENTED — 2026-09-24**

Player preferences answer:

> “What kind of future opportunities do I enjoy?”

They do **not** answer:

> “What must the world make true?”

Store versioned per-player preferences.

Structured interests may include:
- combat;
- exploration;
- investigation;
- social play;
- romance;
- ordinary daily life;
- horror;
- politics/intrigue;
- economy/property;
- pacing.

Also allow bounded free text, e.g.:

> “I want a slow story about living on the edge of a city, eventually buying a house and opening a shop.”

### Hard rule

“Хочу роман с этой NPC” means:
- GM may offer plausible opportunities for closeness if consistent with that NPC.

It does **not** mean:
- NPC now likes the player;
- NPC consents;
- social check automatically succeeds;
- fingerprint/red line is ignored.

Likewise “меньше боёв” affects future flexible encounter selection, not a canonical ambush already happening.

### Co-op

For a shared scene:
- use preferences of participating players;
- merge them predictably;
- no hidden winner-takes-all player priority.

For split parties:
- unrelated player's preferences do not steer another party's scene.

### Implementation closure — 2026-09-24

Stage 22 now has a versioned per-player director-preference layer for AI-world campaigns.

Implemented:
- current per-player preferences plus immutable semantic version history;
- ten bounded 0..5 dimensions: combat, exploration, investigation, social play, romance, daily life, horror, politics/intrigue, economy/property and pacing;
- bounded free text up to 1200 characters, projected to the GM at a smaller prompt budget;
- each authenticated player can read/write only their own preference row; preference history is read-only to clients;
- preferences are AI-world-only and do not require campaign-manager authority;
- primary GM receives preferences only for player users whose PCs are physically present with the source PC;
- split-party players in other locations are excluded from the preference projection;
- co-op aggregation is equal-weight across configured participants and includes mean/min/max/spread per dimension so disagreement is visible instead of silently selecting a winner;
- the primary-GM prompt explicitly treats preferences as future opportunity/pacing guidance only;
- romance preference cannot create attraction, consent or social success; NPC fingerprint, hard red lines and relationships remain authoritative;
- low combat affects only future flexible encounter selection and cannot erase an already established fight;
- free-text wishes such as wanting a house/shop can cause plausible opportunities to appear, but do not create property, money or successful transactions;
- junior materializer, mechanic worker, post-turn worker and background simulation do not receive Stage 22 preferences;
- GM job telemetry records participating/configured counts, merged dimensions and the scene preference version vector;
- the AI tools drawer exposes sliders and bounded free text to every participating player, independently of GM authority.

Rollback-only smoke certification used two real campaign members with deliberately conflicting preferences and verified:
- semantic updates created sequential immutable versions;
- equal-weight combat merge produced the expected mean plus min/max;
- romance disagreement retained its full spread instead of collapsing to one player's preference;
- preference writes did not change campaign events;
- preference writes did not create or mutate NPC identity fingerprint versions;
- the service projection stayed bounded;
- all temporary AI-world slot binding and preference data rolled back.

**Done when:** preferences shape opportunities and pacing without becoming cheat codes.

---

## Stage 23 — Adult / life-simulation content profile

**Status: IMPLEMENTED — 2026-09-24**

This is an **application permission/profile**, not an attempt to remove provider safeguards.

Desired principle:

> When an eligible campaign enables mature content, MEGANOT does not add a second, stricter narrative-sanitization layer merely because the subject matter is adult. The active model/provider remains responsible for its own capabilities and restrictions.

Suggested modes:
- `off`;
- `allowed`;
- `adult_focused`.

### allowed

Mature themes may appear naturally when relevant.

Do not automatically:
- moralize;
- force euphemisms;
- force fade-to-black;
- redirect the plot merely because the theme is adult.

### adult_focused

Especially useful with **Симс**:
- adult relationships and adult venues can have higher opportunity priority;
- life simulation may spend more time on relationships/intimacy and related adult social life when the provider supports it.

But absolutely nothing here changes NPC agency.

A transactional venue can behave transactionally when that is canonically its business.

A random unrelated NPC still reacts from:
- personality;
- relationship;
- circumstances;
- preferences;
- world norms.

Adult-focused is **not** “everyone agrees with the player.”

### Provider boundary

Do not build jailbreak machinery.

Do not promise that one provider can generate what another provider refuses.

If a provider declines a particular output:
- preserve world/canonical state;
- degrade gracefully;
- do not corrupt the campaign by rewriting what happened solely because generation was unavailable.

**Implementation closure — 2026-09-24**

- `public.ai_gm_content_settings` stores one campaign mode: `off`, `allowed` or `adult_focused`; default is `off`.
- The setting is AI-world-only, RLS-protected, readable by campaign members and writable only by a non-anonymous campaign manager.
- `list_campaign_ai_gm_content_profiles_v1` and `set_campaign_ai_gm_content_profile_v1` are `SECURITY INVOKER` RPCs with explicit grants.
- New AI-world slot bindings bootstrap the setting to `off`.
- The profile is excluded from generic Stage 19 canonical context and world/background workers. It is injected only into narrative generation: the primary GM and restricted NPC dialogue context.
- `allowed` permits mature themes to appear naturally when relevant without an extra MEGANOT-only euphemism/moralizing/fade-to-black rule. The selected provider remains authoritative.
- `adult_focused` raises thematic priority for adult life-sim opportunities when they are otherwise plausible; it never alters NPC identity, consent, relationship state, canon, dice, prices or consequences.
- The prompt explicitly forbids provider-bypass/jailbreak behavior and limits the profile to unambiguously adult characters/context.
- Provider HTTP refusals that look like content-policy refusals are recorded as `ai_provider_content_refusal`; the job fails cleanly, no alternate canon is fabricated, and the user can switch model/retry.
- AI tools UI exposes all three modes to members; only campaign managers can change the selected mode.
- Stage 23 telemetry records selected mode and provider-boundary contract on GM jobs.

**Done when:** life-sim can use the mature range supported by the selected provider without MEGANOT unnecessarily adding another sanitization personality on top.

---

## Pre-Stage 24 hardening — Interruptible player plans + situational NPC leverage

**Status: IMPLEMENTED — 2026-09-24**

Before final certification, the player-turn and NPC-resistance contracts were hardened:

### Interruptible player plans
- AI-world player action/spell/item/roll selections are draft declarations, not immediate gameplay.
- Draft components can be assembled in order (up to 64 entries) and may include action, bonus action, movement and declared reaction.
- Draft selection spends no slot/resource, rolls no dice and emits no AI-GM trigger.
- Final Send seals one declaration message and only then wakes the primary GM.
- The primary GM advances the plan one non-reaction component at a time through a service boundary; the server rejects out-of-order advancement.
- Every executed component uses the existing authoritative gameplay RPCs, so resources and dice are spent only when that component actually occurs.
- The GM must re-evaluate D&D action economy, current resources and the changed scene before every next component.
- If NPCs, initiative, world state, a reaction window or a new player choice naturally interrupts the sequence, the unexecuted suffix is marked interrupted instead of being granted automatically.
- Peaceful continuous narration is not forced into artificial one-verb turns when no actor or rule has a meaningful intervention window.
- Declared reactions are armed conditions, not prepaid actions. They execute only after a canonical trigger and are tracked separately from the sequential cursor.

### Situational NPC leverage
- Social influence is evaluated from stable NPC identity plus current circumstances, not from a static whitelist of fears/weaknesses.
- The GM classifies an approach as `no_leverage`, `weak_leverage`, `credible_leverage`, `decisive_leverage` or `blocked_by_identity`.
- `no_leverage` and `blocked_by_identity` cannot silently become a Persuasion/Intimidation roll in runtime.
- A threat can be meaningless even if it normally sounds severe. Example: threatening death to someone who is certainly being executed tomorrow and has accepted it may be deterministic failure; natural 20 does not create leverage.
- If a persistent NPC fingerprint is too sparse for a consequential social decision, the primary GM can request a one-time bootstrap refinement.
- The junior refiner deliberately receives canon without the player's current tactic or recent chat, preventing a tailor-made weakness from being invented for the current attempt.
- Refinement fills only missing stable identity dimensions and cannot overwrite already established values, red lines, self-image or decision priorities.

Rollback-only smoke certification proved:
- final Send emits only the declaration and does not execute gameplay early;
- the service GM executes exactly the next component;
- an unexecuted suffix becomes interrupted when the world intervenes;
- a first sparse-NPC refinement creates stable identity;
- a later attempted yes-man refinement cannot overwrite already established identity.

Supabase security advisor reports no new findings for the new public turn RPCs after the public wrappers were converted to `SECURITY INVOKER` and privileged implementations were moved to `private`.

---

## Stage 24 — Full certification

**Status: CERTIFIED — 2026-09-24**

Must prove the entire stack, not merely that individual files exist.

### Resolver/background
- bounded unbiased server randomness;
- no reroll by decision key;
- independent 30% daily candidate selection;
- 200+ entity simulation;
- compact snapshots;
- safe materialization;
- retention.

### Actors/promotion
- anonymous bestiary actors stay ephemeral;
- independent combat state;
- promotion preserves encounter handoff;
- named NPC later enters background simulation;
- old actor compacts without losing redirect/audit.

### Time/co-op
- split parties cannot see each other's future;
- colocated desynchronized PCs converge through idle-life catch-up;
- catch-up grants no secret achievements/resources;
- canonical materialization waits for safe time.

### Logic-bound rolls
- arbitrary sensible D&D checks can originate from primary-GM fiction;
- junior mechanic worker invokes actual app mechanic;
- strong-alcohol Constitution test;
- known hidden target normal check;
- impossible exact target cannot appear on natural 20;
- Stage 11 existence decision is separate from player skill;
- DC/outcome envelope frozen before d20.

### Turn pipeline
- visible answer precedes nonessential world bookkeeping;
- UI shows «Младший шуршит…»;
- server blocks new free-form messages until commit;
- retries are idempotent;
- next turn sees committed canon.

### Context
- hard recent-history bound;
- no junior/tool command transcript in primary-GM context;
- compact canonical results still present;
- 500-turn prompt does not grow linearly.

### NPC identity
- fingerprint consistent across dialogue/GM/background;
- red lines survive Persuasion;
- relationships can change independently;
- major identity change is versioned/provenanced.

### GM/player configuration
- Жестокий is strict, not adversarial;
- Приключение preserves realism;
- Симс preserves NPC refusal and world logic;
- player preferences steer opportunities, not canon;
- adult/life-sim profile does not override NPC autonomy or provider boundaries.

### Isolation/regression
- human-GM campaigns unchanged;
- quests;
- NPC runtime;
- world materialization;
- real player rolls;
- 45-message maintenance;
- rest/dawn;
- cooperative chat;
all remain green.

### Certification closure — 2026-09-24

Stage 24 now has a cross-system certification gate rather than treating the sum of old unit tests as proof.

Evidence:
- `supabase/tests/ai_world_evolution_stage24_full_certification.sql` is a rollback-only live database smoke against the real schema.
- The live smoke first proves a normal human-GM campaign rejects AI-world background/time behavior, then temporarily binds an unbound AI slot inside the transaction.
- It creates **205+ persistent NPC candidates**, verifies each stored 30% selection decision against its committed d100 roll, reruns the same day and proves the selection is replay-safe rather than rerolled.
- It verifies colocated desynchronized PCs converge through an `idle_life` receipt with `meaningful_actions=false`.
- It writes **500 messages** through the normal chat triggers, proves maintenance remains one serial active 45-message window, and proves Stage 19 exposes only the latest 50 eligible messages.
- During smoke development, future-dated room history was correctly excluded by Stage 19; the final fixture separates background frontier time from scene time and retains that protection.
- `tests/aiWorldEvolutionStage24FullCertification.test.ts` binds Resolver/background, promotion/retention, temporal sync, real player-roll plumbing, Stage 18 post-turn gating, interruptible player plans, bounded context, NPC identity and configuration non-override rules into one CI gate.
- Existing quest, 45-message maintenance, rest, co-op and human-GM isolation regressions remain required by that gate.
- The certification smoke ends with `ROLLBACK`; no fixture campaign, NPC, message, random receipt or maintenance job survives.

Live certification result on 2026-09-24:
- 205+ entity stress: PASS;
- daily-run replay/idempotency: PASS;
- candidate threshold vs committed roll: PASS;
- human-GM isolation: PASS;
- colocated idle catch-up: PASS;
- 500-message room history: PASS;
- serial 45-message maintenance reservation: PASS;
- bounded latest-50 context: PASS;
- rollback cleanliness: PASS.

**Done when:** a full campaign can run for a long time without prompt bloat, temporal leakage, personality drift, tool-log pollution, wish-fulfillment canon or bookkeeping stalls before every answer. **CERTIFIED.**

---

# Practical build order

```text
1  World Resolver
2  Background schema
3  Generation classification
4  Shared bestiary compiler
5  Ephemeral scene actors
6  Scene actor combat
7  AI GM actor integration
8  Promotion
9  Daily candidate Resolver
10 Flash background worker
11 Resolver narrative branching
12 Compact state merger
13 Split-party temporal overlay
14 Canonical materialization bridge
15 Promoted actor background handoff + colocated idle catch-up
16 Cleanup / retention
17 Logic-bound semantic checks + junior real-roll worker
18 Post-response junior world commit + input gate
19 Bounded clean GM context
20 NPC identity fingerprint
21 GM behavior profiles
22 Player director preferences
23 Adult / life-simulation content profile
24 Full certification
25 Causal GM / Resolver hardening
```

Stages 1–3 establish the world-evolution foundation.

Stages 4–8 solve anonymous NPCs correctly.

Stages 9–15 make the autonomous world actually live over game time.

Stages 16–20 keep runtime bounded, make turns non-blocking where possible, keep prompts clean, and make NPC behavior mechanically/personally consistent.

Stages 21–23 make campaign style configurable without letting GM profile, player preference or content mode overrule canon, dice or NPC autonomy.

Stage 24 certifies the whole stack end to end.


---

## Stage 25 — AI-GM causal resolver hardening

**Status: IMPLEMENTED — 2026-09-25**

This stage hardens the current AI-GM without pulling cascade materialization or
inventory execution forward from the next stages.

Implemented contracts:

- AI-GM settings load failures are distinct from a genuine non-AI campaign.
- The junior model selector helper has an explicit authenticated EXECUTE repair.
- Narration addresses the source PC in second person instead of defaulting to
  third-person name/pronoun narration.
- The primary GM receives an explicit source-character knowledge projection from
  location discoveries, NPC discoveries and player-visible memory facts.
- Player wording does not add knowledge and an unknown specific player target
  cannot seed Resolver without known canonical evidence.
- Resolver calls classify generic uncertainty vs world discovery and record
  claim basis plus evidence provenance.
- World discovery requires a conservative rarity class and server-capped
  presence probability: mundane 65%, uncommon 25%, rare 8%, exceptional 2%,
  legendary 1%.
- Repeated world discovery in the same target/category/day reuses one stable
  discovery-pool decision key.
- Primary-GM randomness keys are source-message-stable so regenerate cannot
  obtain a fresh world merely because a new job UUID was created.

Explicitly deferred:

- cascade location topology/materialization: Stage 26;
- executor and inventory canonical commits: Stage 27;
- location media repair and final cross-system E2E: Stage 28.


---

## Stage 26 — Cascade World Builder

**Status: IMPLEMENTED — 2026-09-25**

The AI-world now materializes geography as a bounded hierarchy instead of a
single narrow trail of places directly touched by narration.

Contracts:

- every location carries archetype, scale, structure roles/state and a coverage
  manifest;
- an entered/current location is expanded exactly one structural level down;
- city/settlement expansion creates districts or major functional zones, never
  every house or NPC;
- district expansion creates major clusters/streets/sites, not room trees;
- tavern/inn/building expansion creates its immediate functional rooms/zones;
- forests, caves and dungeons expand into major immediate zones/branches;
- server-side archetype coverage requires core functions or a written omission
  reason instead of trusting the model to declare an incomplete city complete;
- materialize_location_cascade is one service-only transactional tool for
  create/reuse + direct children + transitions + optional PC movement;
- post-turn location commits can therefore create a newly narrated destination,
  build its immediate topology and update character_world_state with one tool
  call;
- current source locations left as legacy stubs are automatically scheduled for
  one-level cascade materialization before the next normal GM continuation;
- direct structural children are mandatory topology, not speculative
  world-bloat; grandchildren remain lazy until physically entered/needed.

Deferred to Stage 27:

- generic typed Executor queue for all mutation classes;
- canonical inventory/economy commits and loot idempotency.


---

## Stage 27 — Deterministic Executor + Inventory Commit

**Status: IMPLEMENTED — 2026-09-25**

The Junior model is now a planner, not the final mutation authority. Every
post-turn tool proposal becomes one typed `agent_jobs` row with
`agent_key=ai_world_executor` and `job_type=canonical_mutation`. The Executor
itself is deterministic server code, so there is no third narrative/model
decision capable of adding canon.

Contracts:

- one immutable post-turn intent maps to one typed Executor job;
- retries reuse the same source-intent job contract instead of replanning a
  different mutation silently;
- legacy Stage 18 mutation families still execute through their transactional
  server boundary, but are now reached through the Executor queue;
- Stage 26 `materialize_location_cascade` is executable from post-turn location
  intents, closing the old whitelist gap;
- `inventory` is a first-class post-turn intent kind;
- acquisition, pickup, spending, consumption or loss stated by the published GM
  answer must produce an inventory intent; merely seeing an item does not;
- `commit_inventory_delta` is the only inventory Executor operation;
- grant no longer authors a physical inventory row first. Junior emits a
  semantic item card; the server Item Registry searches system definitions,
  campaign definitions, stable semantic keys, exact normalized names and
  aliases before authoring anything;
- genuinely new items receive one stable campaign definition keyed by semantic
  identity and are immediately catalogued by category, semantic role, aliases
  and tags; future equivalent requests reuse that definition instead of
  creating UUID garbage;
- standard D&D currency cp/sp/ep/gp/pp resolves to system definitions before
  Cheburashka is called;
- only resolved `definition_id + definition_revision` crosses the Cheburashka
  boundary; Chasovoy remains the source of reusable item identity and physical
  profile, while Cheburashka only owns concrete stacks/instances;
- physical `packing_mode=bulk_stack` maps to Cheburashka
  `stack_mode=stack`; they are deliberately different contracts;
- inventory writes use an outer source-message delta receipt plus deterministic
  Cheburashka sub-command IDs, so regenerate/retry cannot grant, spend or remove
  the same effect twice;
- stackable grants fill/reuse stacks by canonical definition and split at the
  definition's stack_max; instance grants create separate physical instances
  while still sharing one reusable definition;
- the player-turn gate remains closed until every blocking Executor job has
  completed; failed execution leaves the existing Stage 18 recovery gate closed;
- Junior receives a bounded canonical inventory snapshot so consume/remove
  operations must reference real item UUIDs rather than hallucinated ones.

Deferred to Stage 28:

- location media dispatcher recovery;
- persistent 16:9 location hero state and retry UI;
- full cross-system E2E certification and reconciliation of older AI-world
  scenes.
