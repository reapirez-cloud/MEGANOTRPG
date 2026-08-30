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
5. After a character-affecting domain mutation, the owning engine directly requests a fresh snapshot/re-resolution instead of waiting for CE, GENA or a UI to discover drift. GENA may await/record the result, but is not a courier for another engine's storage rows.
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
CHEBURASHKA directly requests character resolution
        ↓
the assembler fetches fresh owner projections; Cheburashka contributes only the remaining mechanical inventory projection
        ↓
CE resolves the new character contract
        ↓
Chat / Revolver / Sheet render the result
```

GENA does not delete the inventory row itself. CE does not tell Cheburashka that an item disappeared. Cheburashka owns the inventory mutation and its resolution signal; GENA owns orchestration/history of what happened during play.

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

**Status:** ACTIVE FOUNDATION / IN DEVELOPMENT — explicit command facade exists while legacy runtime pieces are being consolidated deliberately.

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
- requesting dice resolution from TOBIK and recording the returned result;
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
SHAPOKLYAK: reveal/mark NPC known to Vasya
    ↓
canonical entity visibility changes
```

```text
GM declares Vasya reached the guard warehouse
    ↓
GENA
    ↓
LARISA: reveal/discover warehouse for Vasya
    ↓
canonical location visibility changes
```

```text
GM moves a character to a location
    ↓
GENA
    ↓
SHAPOKLYAK + LARISA engine contract updates canonical placement
```

```text
Player uses a consumable item
    ↓
GENA
    ↓
CHEBURASHKA mutates item state
    ↓
CHEBURASHKA requests fresh character resolution
    ↓
CE resolves again
```

```text
Player/GM requests a roll
    ↓
GENA
    ↓
TOBIK resolves the requested dice expression/plan
    ↓
GENA records the structured result in the game event/history
```

GENA must NOT:
- become a tactical scene simulator;
- enforce action economy, positioning, targets, range, line of sight or narrative legality;
- calculate/apply combat HP damage or healing on its own;
- invent dice results instead of using TOBIK for canonical rolls;
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

## TOBIK — Roll Engine

**Status:** ACTIVE / IN DEVELOPMENT

Responsibility: authoritative dice generation and structured roll resolution.

Tobik should own:
- canonical random die results requested by gameplay/runtime;
- d20 rolls and arbitrary NdS dice;
- modifiers and structured roll plans/recipes;
- advantage/disadvantage or other generic dice primitives when represented explicitly;
- returning enough structured detail for chat/history to show how a result was obtained.

Desired flow:

```text
GENA requests roll → TOBIK resolves dice → structured result → GENA records/presents result
```

Tobik must NOT:
- decide whether a roll was allowed by the scene;
- decide whether an attack hit unless an explicit future contract asks only for arithmetic comparison supplied by the GM/runtime;
- apply damage/healing/HP changes;
- spend class/item resources;
- mutate inventory, characters or locations;
- become the session orchestrator.

Existing server roll paths such as chat/template roll RPCs are part of the emerging Tobik boundary and should be consolidated rather than duplicated by source-specific random logic.

---

## CHEBURASHKA — Inventory Engine

**Status:** ACTIVE FOUNDATION / IN DEVELOPMENT

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
- receiving gameplay mutations through GENA when an item is used during play;
- directly requesting a fresh character resolution after its canonical state commits.

Not every stored item belongs in CE. Cheburashka may keep arbitrary non-mechanical inventory such as a bottle of beer, rope or junk entirely inside inventory state. Only mechanically relevant equipment/effects/actions/resources need to contribute to the CE snapshot.

Cheburashka must NOT:
- decide scene legality;
- become the Character Engine;
- become Shapoklyak;
- own location/world topology;
- wait for CE to tell it an item was consumed;
- require an inventory UI component to communicate mutations to another engine.

Architecture direction:

```text
Inventory mutation during play → GENA → Cheburashka persistence/state
                                      ↓
                         direct resolution request
                                      ↓
                         fresh projections → CE
```

CE consumes the item contribution/state snapshot; CE does not query Cheburashka directly and does not mutate inventory.

---

## SHAPOKLYAK — PC/NPC Creation & Storage Engine

**Status:** ACTIVE FOUNDATION / IN DEVELOPMENT

Responsibility: creation, identity, persistence and lifecycle of player characters and NPCs as entities.

Shapoklyak should own concepts such as:
- creating characters/NPCs under role/permission rules;
- entity identity and canonical records;
- active/inactive/archive lifecycle;
- PC versus NPC ownership/assignment;
- GM/private visibility metadata;
- per-player discovery/visibility where the product requires it;
- character-to-campaign membership;
- persistent placement/location references where coordinated with Larisa;
- stable entity references used by chat, sheets, inventory and world systems.

GENA may instruct Shapoklyak that an explicit play/GM event changes entity visibility, knowledge, placement or lifecycle. Shapoklyak owns the mutation; GENA owns the orchestration/event history.

Shapoklyak must remain separate from CE: CE calculates a character from supplied data; Shapoklyak owns the existence and storage of the character entity itself.

Shapoklyak must also remain separate from Cheburashka: a character can own inventory, but character identity/lifecycle is not inventory state.

---

## LARISA — Location / World + Campaign Time Engine

**Status:** ACTIVE FOUNDATION / IN DEVELOPMENT

Responsibility: persistent world locations, their relationships, and descriptive campaign chronology.

Larisa should own:
- worlds/regions/zones/locations;
- hierarchical containment and links between places;
- maps and map references;
- location descriptions and media;
- per-player/per-character discovery and visibility where required;
- location visibility/private GM information;
- persistent associations of NPCs, encounters, notes or other entities with places;
- stable location identifiers for chat/scenes and future map tooling;
- campaign/world date and time already surfaced in chat;
- per-scene and, where needed, per-character timeline position/stage so the GM can understand when each character currently is;
- GM-authored movement/advancement of world time and chronology markers.

GENA may instruct Larisa that a GM-authoritative or explicit play event reveals/discovers a location, moves an entity, or advances/sets the current campaign time. Larisa owns world/location/time state; GENA records and coordinates the event.

**Larisa time is descriptive bookkeeping, not a rules engine.** Time must not automatically expire effects, restore resources, trigger rests, move NPCs, apply damage, or alter CE merely because a timestamp advanced. It exists to preserve chronology and help understand the stage of each character. Any gameplay consequence of time still comes from an explicit GM/player/runtime command.

Larisa should not attempt to run tactical scene rules. It stores and resolves world/location/chronology structure; the GM still adjudicates what happens there.

---

## Quest Journal — product module, NOT an engine

**Status:** PLANNED / UX FEATURE

The quest journal does not need an engine boundary because it is primarily freeform campaign organization rather than a rules/state-resolution system.

It should support two independent authoring scopes:
- **GM quests** — campaign-facing quest/task entries written and maintained by the GM, with whatever visibility the GM chooses;
- **player personal tasks** — freeform reminders/notes a player writes for themselves so they do not forget goals or errands.

Useful fields may include title, freeform body, status, optional links to NPCs/locations and visibility, but the journal should remain lightweight. A quest entry does not automatically mutate CE, resources, locations, inventory or characters merely because its status changed.

GENA may later attach/link game events to journal entries as convenience, but the journal is not a rules authority and does not need to become another cartoon-named engine.

---

## GM-authoritative state updates

GM edits are a normal first-class input path, not an exceptional maintenance backdoor.

When the GM says a canonical fact changed, GENA should validate/route the intention and the owning engine should persist it according to permissions. A character-affecting owner directly requests fresh resolution; GENA records and coordinates the gameplay fact.

Examples:

```text
GM: set HP to 17
→ SHAPOKLYAK persists 17
→ SHAPOKLYAK requests refresh directly
→ fresh snapshot → CE
→ sheet/chat show 17
```

```text
GM: add/edit a stat, feature, class assignment or other supported character fact
→ owning domain persists canonical edit
→ owning domain engine requests fresh resolution
→ CE resolves from the new snapshot
```

```text
GM: this NPC spoke to Vasya; reveal them
→ GENA event
→ SHAPOKLYAK visibility mutation
→ UI renders newly visible NPC
```

No engine should attempt to “correct” the GM because a previous chat declaration suggests a different scene outcome.

---

## AI audit requirements

When auditing mechanics or architecture, an AI agent MUST distinguish:

1. **CE calculation correctness** — does the resolved character contain the correct abilities/resources/accesses from the supplied snapshot?
2. **GENA orchestration/bookkeeping correctness** — does using/resting/preparing/choosing or an explicit GM command reach the correct owning engine, mutate the correct persistent state, create appropriate history where required, and cause a fresh CE input/projection to be built?
3. **TOBIK roll correctness** — are authoritative random results produced by the shared roll engine/path and returned as structured results instead of source-specific random hacks?
4. **Scene legality** — GM-owned and NOT a required automation target.
5. **Combat HP outcome** — GM-owned. Do not report absence of automatic damage/healing application as a defect.
6. **Inventory ownership/state** — Cheburashka responsibility, not CE/GENA UI ad-hoc logic.
7. **PC/NPC identity/lifecycle/visibility** — Shapoklyak responsibility.
8. **World/location/time persistence/discovery** — Larisa responsibility. Time is descriptive unless explicitly promoted to mechanics later.
9. **Quest journal** — a lightweight GM/player writing feature, not a mechanics engine.
10. **Engine communication** — verify domain engines use explicit contracts/state rather than reading or mutating one another's UI components. Use `ENGINE_CONTRACTS.md` as the command/storage matrix.

Do not report missing scene simulation as a class-mechanics defect. Report defects when machine-owned bookkeeping is wrong or absent: missing resource counters, wrong costs, wrong recharge, missing persistent/rest-refresh choices, missing canonical state mutation, missing CE refresh after mutation, duplicate/erased actions, incorrect class/subclass level ownership, cross-engine mutation performed by the wrong owner, or UI being used as canonical inter-engine transport.

This document is intentionally marked IN DEVELOPMENT. Update it when an engine boundary materially changes.
