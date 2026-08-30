# MEGANOTRPG Engine Roadmap

> Status: **IN DEVELOPMENT**
> Audience: humans and AI agents auditing or extending MEGANOTRPG.
> Branch rule: active architecture/class/runtime work belongs on `dev` until explicitly released.

MEGANOTRPG is intentionally split into cooperating engines. **Do not collapse these responsibilities into a monolithic rules engine.**

## Prime rule: the GM is the scene rules engine

The GM is the final arbiter of what actually happens in the scene.

Application engines automate bookkeeping, persistence, calculations, discoverability, history and presentation. They must **not** attempt to replace the GM by enforcing scene legality such as:

- action economy / number of actions in a turn;
- target validity;
- range or line of sight;
- whether an Echo is currently summoned or positioned correctly;
- whether a creature is actually inside an aura;
- whether a declared action makes narrative or tactical sense;
- other transient scene facts the application was never told.

Example: if a player spends an Echo-related charge while no Echo exists, the application may still record the action and spend the charge. The GM decides that nothing happens. Likewise, the chat engine does not forbid a player from declaring three attacks; the GM decides what counts.

Machine-enforced rules should be limited to state the application explicitly owns: resource counts, costs, recharge, stored choices, preparation results, class/subclass ownership, levels, canonical spell access, etc.

---

## CE — Character Engine

**Status:** ACTIVE / IN DEVELOPMENT

Responsibility: answer **“What does this character currently have?”**

CE is a deterministic calculator. It receives an explicit snapshot/input and returns a resolved character contract.

CE may resolve:
- class/subclass/race/feat/item contributions;
- derived stats and bonuses;
- spell access;
- available actions and resources;
- current resource values supplied in its input;
- source provenance and explicit suppressions supplied by outer runtime.

CE must NOT:
- query chat, Supabase, React, browser state or campaign state;
- decide whether an action is legal in the current scene;
- own chat preparation completion;
- send commands or mutate persistence;
- infer unstated scene state;
- poll another engine for changes.

Whenever canonical state changes, an outer runtime builds a fresh CE input and calls CE again.

---

## GENA — Game State / Session Engine

**Status:** IN DEVELOPMENT — currently exists as distributed runtime pieces and should be consolidated deliberately.

Responsibility: answer **“What happened during play, what state changed, and what must now be shown to the player/GM?”**

GENA is the gameplay state coordinator and bookkeeper, not the GM.

GENA should own or coordinate:
- chat game commands and game-event history;
- server-authoritative resource spending and recharge;
- rests;
- post-rest preparation sessions;
- stored long-rest choices and recorded daily rolls;
- spell preparation commits made through chat;
- player/GM declarations that mutate canonical character state;
- triggering/rebuilding a fresh runtime snapshot after mutations;
- passing that snapshot into CE;
- presenting CE results back through chat/revolver/sheets;
- enough provenance/history for the GM to understand what a player declared and what was spent.

GENA must NOT:
- become a tactical scene simulator;
- enforce action economy, positioning, targets, range, line of sight or narrative legality;
- ask CE to mutate anything;
- make CE query chat;
- silently invent scene state.

Current implementation pieces that are part of the emerging GENA boundary include chat command routing, server chat RPCs, character resource runtime, post-rest preparation runtime, realtime refresh bridges, and CE snapshot reconstruction. During audits, treat these as one emerging engine even when they still live in separate files.

Desired command flow:

```text
Player / GM
    ↓
GENA command
    ↓
server-authoritative mutation + game event
    ↓
canonical persisted state
    ↓
new explicit snapshot
    ↓
CE resolves character
    ↓
GENA/UI presents chat + revolver + sheet state
```

“Done” for a preparation task belongs to GENA/preparation runtime, not CE.

---

## CHEBURASHKA — Inventory Engine

**Status:** PLANNED / IN DEVELOPMENT DESIGN

Responsibility: inventory ownership, storage and item-state workflows.

Cheburashka must be a distinct engine rather than inventory logic embedded into CE or chat components.

Expected responsibility boundary:
- character/container inventory contents;
- item instances versus item definitions/templates;
- quantity, stacks, equipped/carried/stored state;
- item ownership and transfers;
- item-granted effects and mechanical contributions;
- item charges/durability/other explicit persistent item state when authored;
- exposing deterministic item contributions/state to CE;
- receiving gameplay mutations through GENA when an item is used during play.

Cheburashka must NOT:
- decide scene legality;
- become the Character Engine;
- become the PC/NPC storage engine;
- own location/world topology.

Architecture direction:

```text
Inventory mutation during play → GENA → Cheburashka persistence/state → fresh snapshot → CE
```

CE consumes the item contribution/state snapshot; CE does not query Cheburashka directly.

---

## PC/NPC Creation & Storage Engine — NAME TBD

**Status:** PLANNED
**Naming:** choose a name from the Cheburashka cartoon universe later. Do not invent/rename it during automated audits.

Responsibility: creation, identity, persistence and lifecycle of player characters and NPCs as entities.

This engine should own concepts such as:
- creating characters/NPCs under role/permission rules;
- entity identity and canonical records;
- active/inactive/archive lifecycle;
- PC versus NPC ownership/assignment;
- GM/private visibility metadata;
- character-to-campaign membership;
- stable entity references used by chat, sheets, inventory and world systems.

It must remain separate from CE: CE calculates a character from supplied data; this engine owns the existence and storage of the character entity itself.

It must also remain separate from Cheburashka: a character can own inventory, but character identity/lifecycle is not inventory state.

---

## Location / World Engine — NAME TBD

**Status:** PLANNED
**Naming:** choose a name from the Cheburashka cartoon universe later. Do not invent/rename it during automated audits.

Responsibility: persistent world locations and their relationships.

Expected ownership:
- worlds/regions/zones/locations;
- hierarchical containment and links between places;
- maps and map references;
- location descriptions and media;
- location visibility/private GM information;
- persistent associations of NPCs, encounters, notes or other entities with places;
- stable location identifiers for chat/scenes and future map tooling.

This engine should not attempt to run tactical scene rules. It stores and resolves world/location structure; the GM still adjudicates what happens there.

---

## AI audit requirements

When auditing mechanics or architecture, an AI agent MUST distinguish:

1. **CE calculation correctness** — does the resolved character contain the correct abilities/resources/accesses from the supplied snapshot?
2. **GENA bookkeeping correctness** — does using/resting/preparing/choosing mutate the correct persistent state and cause a fresh CE input to be built?
3. **Scene legality** — generally GM-owned and NOT a required automation target.
4. **Inventory ownership/state** — Cheburashka responsibility, not CE/GENA UI ad-hoc logic.
5. **PC/NPC identity/lifecycle** — future dedicated entity engine responsibility.
6. **World/location persistence** — future dedicated location engine responsibility.

Do not report missing scene simulation as a class-mechanics defect. Report defects when machine-owned bookkeeping is wrong or absent: missing resource counters, wrong costs, wrong recharge, missing persistent/rest-refresh choices, missing canonical state mutation, missing CE refresh after mutation, duplicate/erased actions, incorrect class/subclass level ownership, etc.

This document is intentionally marked IN DEVELOPMENT. Update it when an engine boundary materially changes.
