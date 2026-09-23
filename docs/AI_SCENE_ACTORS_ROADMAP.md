# AI Scene Actors — Bestiary-backed Ephemeral NPC Roadmap

> Status: **DESIGN LOCKED**
>
> Scope: experimental AI-world campaigns only.

## Goal

Allow the AI GM to use unnamed creatures and NPCs in scenes without polluting canonical world state with permanent character cards such as `Бандит 1`, `Бандит 2`, `Стражник 3`.

The bestiary is the reusable mechanical definition source.

Anonymous actors are lightweight scene instances.

A permanent NPC card appears only after the player learns a real personal name or the GM explicitly commits to revealing that identity.

## Core lifecycle

```text
bestiary definition
      ↓
spawn ephemeral scene actor
      ↓
scene runtime: hp / effects / actions / resources
      ↓
 ┌───────────────┬──────────────────────────┐
 │ leaves/dies   │ player learns real name │
 │               │                          │
 ▼               ▼
archive       promote existing actor
                  ↓
          canonical world NPC
                  ↓
        background simulation eligible
```

## Product rules

### Anonymous actor

Examples:

- Бандит
- Гоблин
- Волк
- Стражник
- Матрос

These labels may be repeated in one scene.

The runtime distinguishes instances by UUID, not by fake canonical names.

A temporary ordinal may exist for UI/debugging, but it is not world identity.

### Permanent NPC identity

A canonical NPC card is created only when:

1. a real personal name has been revealed to the player; or
2. the primary GM explicitly commits to revealing that name in the same turn.

The promotion must preserve the actor's already-resolved state.

Example:

```text
Гоблин
HP 3/7
poisoned
lost dagger
      ↓
"Меня зовут Ург"
      ↓
NPC: Ург
HP 3/7
poisoned
lost dagger
same location and history
```

No fresh duplicate NPC may be created.

## Proposed storage

### `ai_scene_actors`

AI-world-only runtime table.

Fields:

- `id uuid primary key`
- `campaign_id uuid not null`
- `room_id uuid not null`
- `location_id uuid null`
- `source_bestiary_slug text not null`
- `display_label text not null`
- `ordinal smallint null`
- `identity_state text not null`
  - `anonymous`
  - `named`
  - `promoted`
- `revealed_name text null`
- `promoted_character_id uuid null`
- `life_state text not null`
  - `alive`
  - `dead`
  - `fled`
  - `removed`
- `max_hp integer not null`
- `current_hp integer not null`
- `runtime_state jsonb not null default '{}'`
- `mechanics_snapshot jsonb not null`
- `spawned_game_day integer not null`
- `spawned_day_period text not null`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraints:

- campaign/room/location consistency;
- `current_hp between 0 and max_hp`;
- promoted actors require `promoted_character_id`;
- unique promotion target;
- one actor can be promoted only once;
- only AI-world campaigns may create these rows.

### Why snapshot mechanics

The actor should not read a mutable bestiary definition on every attack.

On spawn, server compiles/snapshots the relevant mechanical definition.

Benefits:

- reproducible encounter state;
- no mid-fight changes if the bestiary definition is revised;
- clean promotion into a persistent NPC;
- lower runtime cost.

The source bestiary slug remains recorded as provenance.

## Shared mechanics compiler

Current Stage 6 NPC runtime already converts `bestiary_catalog` into executable actions/resources.

That conversion must be extracted into one shared server-owned compiler.

Conceptually:

```text
bestiary_catalog
      ↓
compileBestiaryRuntime()
      ├─ canonical NPC runtime
      └─ ephemeral scene actor runtime
```

Do not maintain two separate interpretations of monster actions, damage, saves, reactions or resources.

The model never supplies numeric combat mechanics.

## Runtime tools

### Spawn

Internal tool:

`spawn_scene_actor`

Input:

- source bestiary slug or server-resolved bestiary candidate;
- display label;
- count;
- room/location;
- optional narrative notes.

Server:

1. validates AI-world campaign;
2. loads bestiary definition;
3. compiles mechanics;
4. creates N actor instances;
5. assigns independent HP/runtime state;
6. returns actor IDs.

The AI must not manufacture UUIDs.

### Read scene actors

The AI GM context receives current scene actors:

- actor id;
- display label;
- current HP;
- life state;
- relevant conditions;
- legal action ids;
- whether named/promoted.

Do not send the entire bestiary payload every turn.

### Act

Existing NPC action execution should be generalized so the actor source may be:

- canonical NPC character id; or
- ephemeral scene actor id.

The same server-authoritative dice/action pipeline is used.

### Update state

Server-owned actor mutation:

- HP;
- conditions;
- resource counters;
- flee/remove/death.

No arbitrary free-form mutation from the model.

## Promotion contract

Internal operation:

`promote_scene_actor_to_npc`

Required:

- actor id;
- revealed real name;
- GM/world materialization reason.

Transaction:

1. lock actor row;
2. reject if already promoted, or return existing promoted NPC id;
3. create canonical published NPC;
4. copy source bestiary provenance;
5. copy current HP/max HP;
6. copy surviving runtime resources and conditions;
7. copy current location;
8. copy current game day/day period;
9. create/update NPC profile;
10. build normal canonical NPC runtime from the same bestiary source;
11. connect discovery for characters who heard/learned the name;
12. set `promoted_character_id`;
13. mark actor `promoted`;
14. future runtime references resolve to the canonical NPC.

Promotion is idempotent.

## AI GM rules

Primary GM may use anonymous actors freely.

It should not request permanent materialization just because a creature appears.

Examples:

- "трое бандитов выходят из переулка" -> spawn three scene actors;
- "старший говорит: Меня зовут Рикар" -> promote that one actor;
- "один из волков убегает" -> update/remove actor;
- "волк остаётся с группой, получает имя Серый" -> may promote if canon establishes persistent individual identity.

The world materializer must never create `Бандит 1`, `Гоблин 2`, etc.

## Background simulation integration

Only promoted canonical NPCs are eligible.

Ephemeral actors are never passed to the daily 30% Resolver pool.

After promotion:

- the permanent NPC may be marked `background_simulation_scope='entity'`;
- later daily Resolver runs may select it;
- its history can continue independently off-screen.

## Cleanup

Anonymous actors should not live forever.

Suggested policy:

- active room actors remain while scene state references them;
- dead/fled/removed actors remain as encounter history for a short retention window;
- archived scene actors can be compacted/pruned later;
- promoted actors retain only the lightweight redirect/provenance row after canonical state is established.

No cleanup may delete promoted canonical NPC state.

# Implementation roadmap

## Stage 1 — Schema and invariants

Create `ai_scene_actors`.

Add:

- identity/life-state constraints;
- AI-world-only guard;
- campaign/room/location integrity;
- unique/idempotent promotion constraints;
- indexes for active room actors and promoted actor lookup;
- RLS/service-role boundaries appropriate for AI runtime.

Tests:

- normal human campaign cannot create actor rows;
- invalid HP/state rejected;
- duplicate promotion impossible.

**Result:** safe storage exists, but nothing uses it yet.

---

## Stage 2 — Extract shared bestiary runtime compiler

Refactor current Stage 6 bestiary-to-NPC mechanics conversion into one reusable server module/helper.

It must compile:

- abilities;
- AC/HP;
- saves/skills;
- attacks;
- save actions;
- damage;
- reactions;
- limited-use resources;
- recharge metadata.

Canonical NPC runtime continues using this helper unchanged in behavior.

Tests must prove existing NPC Stage 6 output remains equivalent.

**Result:** one mechanical interpretation for both permanent NPCs and scene actors.

---

## Stage 3 — Scene actor spawn/read runtime

Implement server RPC/internal boundary to:

- spawn one or multiple actors from one bestiary slug;
- snapshot mechanics;
- assign independent runtime state;
- list current active actors for a room.

Add compact scene-actor context to AI GM.

Do not expose full bestiary blobs in chat context.

**Result:** AI can create three goblins without creating three world NPC cards.

---

## Stage 4 — Scene actor combat execution

Generalize NPC action/roll execution to accept an actor reference type:

```ts
{ kind: "npc", characterId }
{ kind: "scene_actor", actorId }
```

Reuse the same server dice, save, target, resource and legality checks.

Add:

- damage/state updates;
- limited-resource consumption;
- death/flee/remove state;
- hard-wait player saves exactly as canonical NPC actions do.

Tests:

- two actors from same bestiary keep separate HP/resources;
- one actor dying does not mutate another;
- model cannot forge attack bonus/damage/DC.

**Result:** anonymous actors are fully playable combatants.

---

## Stage 5 — AI GM integration

Add tools available only to AI-world GM runtime:

- `spawn_scene_actor`;
- `set_scene_actor_state` with narrow server-validated operations;
- actor action selection/execution;
- read current actors.

Update GM prompt:

- unnamed scene extras -> ephemeral actors;
- do not call `create_world_npc`;
- only promote after real-name reveal;
- no fake numbered names.

Update world materializer prompt accordingly.

**Result:** AI naturally uses ephemeral actors instead of polluting world state.

---

## Stage 6 — Promotion to canonical NPC

Implement transactional `promote_scene_actor_to_npc`.

Copy:

- name;
- bestiary provenance;
- current HP/state;
- relevant runtime resources/effects;
- current location/time;
- contextual NPC profile fields that are already established.

Then build normal canonical NPC runtime using the same shared compiler.

Create discovery for players who learned the identity.

Add redirect/resolution so stale actor references resolve to the promoted NPC.

Tests:

- promotion preserves damage/resources;
- duplicate promotion returns same character;
- promotion after death is handled deliberately;
- promotion cannot silently alter bestiary source.

**Result:** "Гоблин" can become "Ург" without losing history.

---

## Stage 7 — Background simulation handoff

Add `background_simulation_scope` defaults/rules for promoted NPCs.

Resolver eligibility:

- ignores all ephemeral scene actors;
- includes promoted persistent NPCs when eligible.

Ensure old actor runtime history is linked as provenance to the canonical NPC/background snapshot.

**Result:** minor scene actors can organically become persistent world actors and later develop off-screen.

---

## Stage 8 — Cleanup and retention

Implement archival policy for dead/fled/removed anonymous actors.

Keep enough data for:

- chat/event audit;
- encounter history;
- promotion redirects;
- replay/debugging.

Do not keep full mechanics snapshots forever if a compact immutable encounter record is sufficient.

**Result:** runtime stays small even after long campaigns.

---

## Stage 9 — Certification

Required cases:

1. three identical bestiary bandits spawn as separate actors;
2. no `characters` rows are created;
3. each actor has independent HP/resources;
4. one receives a name and promotes;
5. promoted NPC preserves current state;
6. remaining anonymous bandits never enter background simulation;
7. promoted NPC can enter the 30% Resolver pool later;
8. two simultaneous promotion attempts produce one NPC;
9. normal human-GM campaign remains unchanged;
10. existing Stage 6 canonical NPC combat remains green.

## Recommended build order

Do not implement background integration first.

Correct dependency order:

```text
Stage 1 schema
→ Stage 2 shared compiler
→ Stage 3 spawn/read
→ Stage 4 combat
→ Stage 5 AI integration
→ Stage 6 promotion
→ Stage 7 background handoff
→ Stage 8 cleanup
→ Stage 9 certification
```

The critical architectural boundary is Stage 2.

If the bestiary compiler remains duplicated, temporary actors and permanent NPCs will eventually disagree about attacks, saves or resources. One compiler must own both.
