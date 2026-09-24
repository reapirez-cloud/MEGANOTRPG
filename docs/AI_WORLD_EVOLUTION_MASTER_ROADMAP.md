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

## Stage 17 — Canon-bound intent adjudication and real player rolls

**Status: PLANNED**

The player d20 answers how well the character performs an action. It does **not** decide whether an unstated world fact suddenly exists.

Before a player roll, the AI GM must evaluate the declared intent against current canon and choose one of:

- `deterministic_success` — no roll;
- `deterministic_failure` — no roll;
- `check` — real player d20 with a precommitted DC/outcome envelope;
- `impossible_exact` — exact requested result is unavailable; natural 20 may unlock only a precommitted plausible partial result.

### Required separation

World existence and character performance are different uncertainties.

For example, “I search the forest for a hut”:

- if canon says the hut exists there, the AI can request Survival/Perception/Investigation with a difficulty chosen from the situation;
- if canon says it does not exist, the exact result cannot succeed;
- if no hut is established at all, the skill roll does not create one;
- natural 20 may yield bounded partial success such as shelter, old foundations, human tracks, distant smoke or another useful lead.

Likewise, “I search the forest for a dragon” cannot spawn a dragon on natural 20. A critical result may reveal a dragon-like clue or analogue only if the pre-roll adjudication allowed that partial envelope.

If world existence is genuinely unresolved and should be randomized, Stage 11 World Resolver settles **existence first**. Only after existence is committed may a player skill roll determine whether the character finds or interacts with it.

### Pre-roll receipt

Before exposing the d20 request, persist:

- player intent + source-message fingerprint;
- scene/canon evidence fingerprint;
- adjudication mode;
- exact goal and whether exact success is allowed;
- request type / ability / skill;
- AI-selected DC and visibility for normal checks;
- natural-20 policy;
- frozen success/failure/partial-success envelopes.

The existing `pending_player_roll_requests` must reference this receipt.

After the roll exists, neither the model nor a retry may change the DC, canonical evidence, exact-goal permission or outcome envelope.

**Done when:** the AI can logically decide whether a check is appropriate, choose its difficulty before the roll, request the real player die, and narrate only inside the server-frozen outcome without using the d20 to invent canon.

Full executable contract and examples:
`docs/AI_WORLD_EVOLUTION_STAGE17_LOGIC_ROLLS.md`

---

## Stage 18 — Full certification

Must pass at least:

### Resolver
- unbiased/bounded rolls;
- decision key cannot reroll;
- duplicate daily run blocked;
- two simultaneous dawns cannot duplicate a day simulation.

### Selection
- 200 eligible NPCs can all independently participate in 30% selection;
- no d100/entity-index coupling;
- Flash receives only selected entities.

### Locations
- tavern can be simulated;
- tavern room/toilet cannot be independently selected when marked detail;
- nested hierarchy does not automatically disable a whole location.

### Anonymous actors
- three bandits spawn from one bestiary entry;
- no permanent character rows;
- independent HP/resources;
- actor can die/flee independently.

### Promotion
- one actor gets a real name;
- one canonical NPC created;
- HP/resources/history preserved;
- concurrent promotion creates no duplicate;
- promoted NPC can later enter Resolver pool.

### Background
- critical 1/100 respected but constrained by canon;
- neutral result may create no lasting event;
- existing threads can continue;
- no context growth proportional to total history.

### Time
- day-3 player cannot see day-5 event;
- canonical materialization cannot leak future state backward.

### Isolation
- human-GM campaigns unchanged;
- background system only operates in `ai_world_slots` campaigns.

### Logic-bound player rolls
- adjudication is persisted before the d20;
- known target can use a normal AI-selected DC;
- deterministic success/failure does not ask for a cosmetic roll;
- unestablished hut/dragon cannot be created by the player roll;
- impossible exact goal can yield only bounded natural-20 partial success;
- DC/evidence/outcome envelope cannot change after the roll request exists;
- Stage 11 world-existence decision remains separate from player skill.

### Regression
- existing player rolls;
- Stage 6 canonical NPC runtime;
- quests;
- world materialization;
- 45-message maintenance;
- rest/dawn;
- cooperative split-party runtime;
all remain green.

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
15 Promoted actor background handoff
16 Cleanup
17 Canon-bound intent adjudication + real player rolls
18 Full certification
```

Stages 1–3 establish the world-evolution foundation.

Stages 4–8 solve anonymous NPCs correctly.

Stages 9–15 make the autonomous world actually live over game time.

Stage 16 keeps it from becoming an immortal landfill of goblin state.

Stage 17 makes player checks logic-bound instead of letting a lucky d20 manufacture world facts.

Stage 18 certifies the whole stack end to end.
