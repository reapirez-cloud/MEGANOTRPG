# MEGANOTRPG Engine Roadmap

> Status: **IN DEVELOPMENT**
> Audience: humans and AI agents auditing or extending MEGANOTRPG.
> Branch rule: active architecture/class/runtime work belongs on `dev` until explicitly released.

MEGANOTRPG is intentionally split into cooperating engines. **Do not collapse these responsibilities into a monolithic rules engine.**

## Prime rule: the GM is the scene rules engine and an authoritative source of truth

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

The GM may also directly establish canonical persistent facts. These are not hacks or bypasses: they are first-class authoritative commands. Examples include:

- “this NPC is now known/visible to these players”;
- “this character has reached/discovered this location”;
- “move this PC/NPC to this location”;
- “this character now has 17 HP”;
- “set/correct this stat, resource, feature, assignment or other editable canonical value”.

**HP is specifically GM-authoritative.** Chat actions, attacks, damage rolls, healing rolls, spells and item use must not automatically change another creature's HP, and they do not need to automatically change the actor's HP either. The GM may run an entire combat mentally or externally and update HP afterward. A later convenience UI may help the GM set HP, but no engine should infer combat HP mutations from declarations unless the architecture is explicitly changed by the user.

---

## Engine communication rule

**Engines communicate through explicit engine contracts. UI components do not act as bridges between engines.**

Never build flows such as:

```text
Chat UI → Sheet UI → inventory widget → CE
```

or make one engine scrape/read another engine's rendered interface.

Instead:

```text
UI → command → GENA / owning domain engine → canonical state
                                      ↓
                              explicit projections
                                      ↓
                              fresh CE snapshot
                                      ↓
                           resolved presentation data
                                      ↓
                          Chat / Sheet / Revolver UI
```

Rules:

1. Each domain engine owns its canonical persistent state.
2. Cross-domain **play mutations** should normally be coordinated by GENA so the action can be recorded, correlated and propagated consistently.
3. Engines may expose explicit read/projection contracts to other engines or to the snapshot builder. They must not depend on another engine's UI.
4. CE remains passive: it receives an explicit snapshot and returns a resolved contract. It never announces changes to other engines.
5. After a domain mutation, GENA coordinates a fresh snapshot/re-resolution instead of waiting for CE to discover anything.
6. UI sends intentions/commands and renders results. UI-local state is never canonical inter-engine transport.

Example — consumable grenade:

```text
Player presses “Use grenade”
        ↓
GENA records/orchestrates the declared use
        ↓
CHEBURASHKA.consumeItem(instanceId)
        ↓
Cheburashka decrements quantity/charge or removes the item
        ↓
GENA rebuilds the character snapshot
        ↓
Cheburashka contributes the remaining mechanical inventory projection
        ↓
CE resolves the new character contract
        ↓
Chat / Revolver / Sheet render the result
```

GENA does not delete the inventory row itself. CE does not tell Cheburashka that an item disappeared. Cheburashka owns the inventory mutation; GENA owns orchestration of what happened during play.

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
- poll another engine for changes;
- act as the canonical inventory/PC/NPC/location database.

Whenever canonical state changes, an outer runtime builds a fresh CE input and calls CE again.

The sheet is a renderer/management surface over canonical state and resolved CE output. **GENA and other engines must not read the character sheet UI to learn character state.** They use canonical engine contracts/state and CE output directly where appropriate.

---

## GENA — Game State / Session Engine

**Status:** IN DEVELOPMENT — currently exists as distributed runtime pieces and should be consolidated deliberately.

Responsibility: answer **“What happened during play, what state changed, which domain engine must handle it, and what must now be shown to the player/GM?”**

GENA is the **central session orchestrator** and gameplay bookkeeper. It is the main coordinator between player/GM commands and the specialized domain engines. This does not make GENA the rules judge: the GM remains the scene authority, and each specialized engine remains authoritative for its own domain state.

GENA should own or coordinate:
- chat game commands and game-event history;
- routing player/GM declarations to the correct domain engine;
- server-authoritative resource spending and recharge;
- rests;
- post-rest preparation sessions;
- stored long-rest choices and recorded daily rolls;
- spell preparation commits made through chat;
- player/GM declarations that mutate canonical character state;
- GM-authoritative commands/overrides and their audit trail;
- cross-engine consequences of play events;
- visibility/discovery consequences when explicitly declared by the GM;
- triggering/rebuilding a fresh runtime snapshot after mutations;
- passing that snapshot into CE;
- presenting CE/domain results back through chat/revolver/sheets;
- enough provenance/history for the GM to understand what a player declared, what was spent and what changed.

Examples of GENA orchestration:

```text
GM speaks/acts as NPC toward Vasya
    ↓
GENA receives an explicit GM command/event
    ↓
PC/NPC Engine: reveal/mark NPC known to Vasya
    ↓
canonical entity visibility changes
```

```text
GM declares Vasya reached the guard warehouse
    ↓
GENA
    ↓
Location Engine: reveal/discover warehouse for Vasya
    ↓
canonical location visibility changes
```

```text
GM moves a character to a location
    ↓
GENA
    ↓
PC/NPC + Location engine contract updates canonical placement
```

```text
Player uses a consumable item
    ↓
GENA
    ↓
CHEBURASHKA mutates item state
    ↓
GENA rebuilds snapshot
    ↓
CE resolves again
```

GENA must NOT:
- become a tactical scene simulator;
- enforce action economy, positioning, targets, range, line of sight or narrative legality;
- calculate/apply combat HP damage or healing on its own;
- ask CE to mutate anything;
- make CE query chat;
- read another engine's UI as canonical state;
- silently invent scene state.

Current implementation pieces that are part of the emerging GENA boundary include chat command routing, server chat RPCs, character resource runtime, post-rest preparation runtime, realtime refresh bridges, and CE snapshot reconstruction. During audits, treat these as one emerging engine even when they still live in separate files.

Desired command flow:

```text
Player / GM
    ↓
GENA command
    ↓
route to owning engine(s)
    ↓
server-authoritative mutation + game event
    ↓
canonical persisted domain state
    ↓
new explicit snapshot/projections
    ↓
CE resolves character where relevant
    ↓
GENA/UI presents chat + revolver + sheet/world/entity state
```

“Done” for a preparation task belongs to GENA/preparation runtime, not CE.

---

## CHEBURASHKA — Inventory Engine

**Status:** PLANNED / IN DEVELOPMENT DESIGN

Responsibility: inventory ownership, storage and item-state workflows.

Cheburashka is the **warehouse keeper / porter** of MEGANOTRPG. It owns inventory state and supplies only the mechanically relevant projection of that state to character resolution.

Cheburashka must be a distinct engine rather than inventory logic embedded into CE or chat components.

Expected responsibility boundary:
- character/container inventory contents;
- item instances versus item definitions/templates;
- quantity, stacks, equipped/carried/stored state;
- item ownership and transfers;
- item-granted effects and mechanical contributions;
- item charges/durability/other explicit persistent item state when authored;
- exposing deterministic item contributions/state to CE snapshot construction;
- receiving gameplay mutations through GENA when an item is used during play.

Not every stored item belongs in CE. Cheburashka may keep arbitrary non-mechanical inventory such as a bottle of beer, rope or junk entirely inside inventory state. Only mechanically relevant equipment/effects/actions/resources need to contribute to the CE snapshot.

Cheburashka must NOT:
- decide scene legality;
- become the Character Engine;
- become the PC/NPC storage engine;
- own location/world topology;
- wait for CE to tell it an item was consumed;
- require an inventory UI component to communicate mutations to another engine.

Architecture direction:

```text
Inventory mutation during play → GENA → Cheburashka persistence/state → fresh snapshot → CE
```

CE consumes the item contribution/state snapshot; CE does not query Cheburashka directly and does not mutate inventory.

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
- per-player discovery/visibility where the product requires it;
- character-to-campaign membership;
- persistent placement/location references where coordinated with the Location Engine;
- stable entity references used by chat, sheets, inventory and world systems.

GENA may instruct this engine that an explicit play/GM event changes entity visibility, knowledge, placement or lifecycle. The engine owns the mutation; GENA owns the orchestration/event history.

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
- per-player/per-character discovery and visibility where required;
- location visibility/private GM information;
- persistent associations of NPCs, encounters, notes or other entities with places;
- stable location identifiers for chat/scenes and future map tooling.

GENA may instruct the Location Engine that a GM-authoritative or explicit play event reveals/discovers a location or moves an entity. The Location Engine owns world/location state; GENA records and coordinates the event.

This engine should not attempt to run tactical scene rules. It stores and resolves world/location structure; the GM still adjudicates what happens there.

---

## GM-authoritative state updates

GM edits are a normal first-class input path, not an exceptional maintenance backdoor.

When the GM says a canonical fact changed, the owning engine should accept/validate the command according to permissions, persist it, and let GENA propagate the resulting state change.

Examples:

```text
GM: set HP to 17
→ owning character state path persists 17
→ GENA observes/coordinates refresh
→ fresh snapshot → CE
→ sheet/chat show 17
```

```text
GM: add/edit a stat, feature, class assignment or other supported character fact
→ owning domain persists canonical edit
→ GENA rebuilds/propagates state
→ CE resolves from the new snapshot
```

```text
GM: this NPC spoke to Vasya; reveal them
→ GENA event
→ PC/NPC Engine visibility mutation
→ UI renders newly visible NPC
```

No engine should attempt to “correct” the GM because a previous chat declaration suggests a different scene outcome.

---

## AI audit requirements

When auditing mechanics or architecture, an AI agent MUST distinguish:

1. **CE calculation correctness** — does the resolved character contain the correct abilities/resources/accesses from the supplied snapshot?
2. **GENA orchestration/bookkeeping correctness** — does using/resting/preparing/choosing or an explicit GM command reach the correct owning engine, mutate the correct persistent state, create appropriate history where required, and cause a fresh CE input/projection to be built?
3. **Scene legality** — GM-owned and NOT a required automation target.
4. **Combat HP outcome** — GM-owned. Do not report absence of automatic damage/healing application as a defect.
5. **Inventory ownership/state** — Cheburashka responsibility, not CE/GENA UI ad-hoc logic.
6. **PC/NPC identity/lifecycle/visibility** — dedicated entity engine responsibility.
7. **World/location persistence/discovery** — dedicated location engine responsibility.
8. **Engine communication** — verify domain engines use explicit contracts/state rather than reading or mutating one another's UI components.

Do not report missing scene simulation as a class-mechanics defect. Report defects when machine-owned bookkeeping is wrong or absent: missing resource counters, wrong costs, wrong recharge, missing persistent/rest-refresh choices, missing canonical state mutation, missing CE refresh after mutation, duplicate/erased actions, incorrect class/subclass level ownership, cross-engine mutation performed by the wrong owner, or UI being used as canonical inter-engine transport.

This document is intentionally marked IN DEVELOPMENT. Update it when an engine boundary materially changes.
