# Named Engine Contracts

> Status: **IN DEVELOPMENT — RUNTIME FOUNDATION ACTIVE ON `dev`**
>
> Read this document together with `ENGINE_ROADMAP.md` and `CHASOVOY_ENGINE_CONTRACT.md` before changing gameplay commands, character resolution, inventory, reference definitions, entities, rolls, locations or chat action execution.

## One owner for every canonical fact

| Engine | Owns and persists | Does not own |
|---|---|---|
| **CHASOVOY** | reusable canonical definitions: classes, subclasses, spells, items, feats/features, conditions and reference data; stable ids/slugs, scopes and revisions | character ownership/state, quantities, current charges, preparation, HP, locations, runtime resources |
| **GENA** | session declarations/history, gameplay command routing, character resource ledger, rests, preparation, stored session choices/results, command correlation | definitions, inventory rows, entity identity, world topology, dice algorithms, CE calculations, scene rulings |
| **CE** | no canonical persistence; deterministic calculation and one transient resolved contract from explicit input | definitions storage, inventory, characters, HP persistence, resources, chat, rolls, locations, time, commands |
| **CHEBURASHKA** | item instances, holders, quantities, charges, equipment state, transfers and arbitrary per-instance state | item definitions, character identity, HP, world placement, scene rulings, resolved totals |
| **SHAPOKLYAK** | PC/NPC existence, identity, type, assignment, visibility/discovery, lifecycle and canonical base character facts including explicit GM HP | definitions, inventory, locations/topology, dice, derived CE totals, session history |
| **LARISA** | locations/world hierarchy, links/maps, discoveries, character and scene placement, scene participants, descriptive chronology | definitions, character mechanics, resource recharge, effect expiry, inventory, HP, scene rulings |
| **TOBIK** | dice parsing/planning and one requested random resolution in memory | definitions, durable history, resources, HP, inventory, hit/miss decisions, scene legality |

`engine_command_receipts` is shared infrastructure for idempotency, not a domain owner.

## Definition law

A reusable game concept has one canonical definition in Chasovoy. Other engines store a stable definition reference plus only the runtime state they own.

Examples:

```text
Chasovoy: Fireball definition
Gena/runtime: whether a character knows/prepared it and slot/resource state

Chasovoy: Ash Blade definition
Cheburashka: which character owns an instance, quantity, equipped state, current charges
```

Creating or giving another instance never creates another definition. A deliberate variant/fork receives a new canonical id. Editing a definition creates a new revision under the same identity.

## CE input ownership

CE stores nothing between calls. A character resolution assembler obtains fresh projections from owners and definitions from Chasovoy, then creates one `CharacterEngineInput`.

| Input part | Canonical owner | CE receives |
|---|---|---|
| identity, level, base abilities, explicit HP | Shapoklyak | base/state projection required for arithmetic |
| class resources, spell slots, stored choices, preparation | Gena runtime | explicit runtime state |
| class/subclass/spell/feat definitions | Chasovoy | resolved canonical definitions/contributions |
| item definition/mechanics | Chasovoy | definition resolved for referenced items |
| item ownership/equipment/current state | Cheburashka | `InventoryMechanicalProjection` assembled from definition + instance state, never the backpack |
| locations/time | Larisa | nothing by default; only a deliberately introduced projection |
| dice result | Tobik through Gena | never canonical character storage merely because a roll happened |

A beer bottle with no mechanics remains inventory state plus its definition reference. A protection ring may contribute AC while equipped. Current charges remain Cheburashka state; the meaning of the item belongs to Chasovoy.

## Engine surfaces

### Chasovoy — canonical definition guard

Commands:
- `definition.create`
- `definition.revise`
- `definition.archive`

Queries:
- `getDefinition({ id, revision? })`
- `getBySlug(...)`
- `listDefinitions(...)`

Rules:
- no character/runtime ownership;
- no direct CE-resolution request after a definition edit;
- publishes definition events so Gena/resolver can determine affected references;
- system definitions require system authority; campaign definitions are GM-authored;
- identity is stable, revision content is versioned.

### Gena — central session orchestrator

Routes gameplay intentions to the owning domain engine, owns history/correlation and runtime resources/preparation. It never becomes the catalog or rules-reference database.

### CE — pure character calculator

Resolves a supplied explicit snapshot. It performs no I/O, sends no commands and persists nothing.

### Cheburashka — inventory instance engine

Commands include create/update/remove/equip/consume/transfer. It owns instance state, not reusable item definitions. A character-affecting instance mutation requests fresh character resolution.

### Shapoklyak — PC/NPC entity engine

Owns who exists, assignment/lifecycle/visibility and GM-authoritative base facts/HP.

### Larisa — world/location engine

Owns world hierarchy, placement, discovery, scenes and descriptive time. Time alone never causes CE/resource/HP effects.

### Tobik — roll engine

Owns structured dice resolution for a requested roll. It never applies HP or decides scene legality.

## Communication rules

1. UI calls engine command/query contracts and renders canonical/resolved state. UI is never an engine-to-engine bridge.
2. Gena coordinates play intentions that cross history and another domain; the specialized owner still mutates its own state.
3. An engine never reads or writes another engine's tables. It uses that engine's contract/projection.
4. After a character-affecting runtime commit, the owning engine calls the resolution requester directly. The resolver fetches fresh runtime projections and Chasovoy definitions, then calls CE.
5. A Chasovoy definition mutation is different: Chasovoy does not know character usages, so it emits a definition event and the resolver/runtime maps references to affected aggregates.
6. CE never calls back, polls, publishes changes or owns snapshot sources.
7. Commands that are one gameplay fact share correlation/idempotency context.
8. Raw UI realtime subscriptions are refresh fallbacks, not canonical engine communication.

## Canonical item sequence

```text
GM authors Ash Blade
→ Chasovoy persists definition D1

GM gives Ash Blade to Vasya
→ Gena validates/orchestrates
→ Chasovoy resolves D1
→ Cheburashka creates inventory instance I1 → D1
→ Cheburashka requests character resolution
→ resolver gets Shapoklyak state + Gena runtime + Cheburashka instance projection + Chasovoy definitions
→ CE resolves
→ Sheet / Chat / Revolver render the same contract
```

If I1 reaches zero quantity, Cheburashka removes the instance. D1 remains in Chasovoy because deleting a possession is not deleting the concept of the item.

## GM authority and HP

Damage/healing rolls are declarations/results only. Neither Gena nor Tobik nor CE infers target HP mutation.

```text
GM: character.set_hp
→ Gena verifies GM authority
→ Shapoklyak persists HP
→ Shapoklyak requests fresh character resolution
→ resolver fetches fresh owner state and Chasovoy definitions
→ CE recalculates
```

The GM remains the final scene authority.
