# Named Engine Contracts

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**
>
> Read this document together with `ENGINE_ROADMAP.md`, `CHARACTER_ENGINE_CONTRACT.md`, `CHASOVOY_ENGINE_CONTRACT.md` and `ORACLE_ENGINE_CONTRACT.md` before changing gameplay commands, GM controls, character resolution, inventory, definitions, entities, rolls, locations or chat action execution.

## One owner for every canonical fact

| Engine / control plane | Owns and persists | Does not own |
|---|---|---|
| **CHASOVOY** | reusable canonical definitions: classes, subclasses, spells, items, feats/features, conditions/reference data, stable identity and revisions | character ownership/state, quantities, current charges, preparation, HP, locations, runtime resources |
| **GENA** | normal gameplay/session declarations/history, Trade session/revision/acceptance/thread/history state, authoritative execution routing and command correlation/receipts | GM imperative reality edits, character resource rows, spells/preparation rows, inventory rows, entity identity, world topology, definitions, CE calculations, scene rulings |
| **ORACLE** | no canonical persistence; imperative GM control surface that directly calls the explicit owner | gameplay orchestration, rule legality, domain storage, derived CE totals, duplicate domain events |
| **CE** | no canonical persistence; deterministic calculation and one transient resolved contract from explicit input | storage, commands, inventory, characters, HP persistence, resources, chat, rolls, locations, time |
| **CHEBURASHKA** | item instances, holders, quantities, charges, equipment state, transfers, world-storage/Surface ownership and per-instance runtime state | reusable item definitions, character identity, HP, scene/location access rules, scene rulings, resolved totals |
| **SHAPOKLYAK** | PC/NPC identity, assignment, lifecycle/visibility and canonical character mechanics/runtime state: base sheet facts, explicit HP, spells/options/features, preparation, suppressions, template assignments and persistent character resources | reusable definitions, inventory instances, world topology, dice, derived CE totals, session history |
| **LARISA** | locations/world hierarchy, links/maps, discovery, character/scene placement, current scene participants, scene Surface access/lifecycle, descriptive chronology and NPC habitats | item-instance contents, definitions, character mechanics/resources, HP, scene rulings |
| **TOBIK** | authoritative dice planning/resolution for a requested roll | durable domain state, resources, HP, inventory, hit/miss scene decisions, scene legality |
| **SNAKE** | no canonical persistence; universal UI interaction/action orchestration: context invocation, reusable surfaces and dispatch into the declared control/owner path | domain rules/state, owner storage, CE calculation, permission invention, arbitrary Supabase writes |

`engine_command_receipts`, `EngineEventBus` and `CharacterResolutionBus` are shared infrastructure, not domain owners.

## Definition law

A reusable concept has one canonical definition in Chasovoy. Runtime owners store a stable reference plus only the mutable state they own.

```text
Chasovoy: Fireball definition
Shapoklyak: this character knows/prepared Fireball and has character casting/resource state

Chasovoy: Ash Blade definition
Cheburashka: character C9 owns instance I73, equipped=true, charges=2
```

Creating another instance never creates another definition. A deliberate variant/fork gets a new identity. Editing a definition creates a new revision under the same canonical identity.

## Two command planes

Normal gameplay:

```text
Player / gameplay UI
→ GENA
→ explicit authoritative domain/storage boundary
→ canonical state
→ owner invalidation where mechanical
→ Character Runtime Resolver
→ CE
→ shared resolved presentation
```

Explicitly permitted player-owned mutations may call an owner facade directly if session orchestration is unnecessary. The server must still prove assignment/permission.

GM authority:

```text
GM Cabinet
→ Oracle
→ explicit owner
→ canonical state
→ owner invalidation/read model
```

**Oracle and GENA are parallel entry points. Oracle MUST NOT call GENA.**

## CE input ownership

CE stores nothing between calls. The Character Runtime Resolver obtains fresh owner state/projections and Chasovoy definitions, then creates one `CharacterEngineInput`.

| Input part | Canonical owner | CE receives |
|---|---|---|
| identity, level, base abilities, explicit HP | Shapoklyak | base/state projection required for arithmetic |
| persistent resources, spell/preparation state, template assignments/suppressions | Shapoklyak | explicit current character mechanics/runtime state |
| class/subclass/spell/feat/item definitions | Chasovoy | canonical definitions converted to contributions |
| item ownership/equipment/current instance state | Cheburashka | mechanically relevant inventory projection — never the backpack itself |
| locations/time | Larisa | nothing by default; only a deliberately introduced projection |
| dice result | Tobik through GENA | never character canonical state merely because a roll happened |

Oracle is not a CE input owner. Oracle changes a canonical fact through its owner; normal invalidation then rebuilds the shared runtime.

## Engine surfaces

### Chasovoy — definition owner

Canonical commands include `definition.create`, `definition.revise` and `definition.archive`. Chasovoy owns identity/revisions, not concrete character/item runtime ownership. Definition changes publish events; campaign/runtime infrastructure determines which mounted characters must reread them.

### GENA — normal gameplay/session orchestrator

GENA handles normal gameplay intentions, command correlation/history and authoritative gameplay execution. It may cause an owner state change, but that does not transfer ownership to GENA.

GENA also owns **session-scoped orchestration state** when that state is itself the gameplay/session fact rather than another domain's fact. Stage 10 Trade is the canonical example: the Trade session, offer revision, A/B acceptance, explicit visibility grants, interest markers, negotiation thread and Trade history belong to GENA; the physical items referenced by the offer remain Cheburashka state.

Trade settlement therefore follows:

```text
future Trade UI / Snake
→ typed TradeSession / GENA boundary
→ same-revision A/B acceptance
→ private Cheburashka atomic exchange projection
→ canonical inventory state
```

GENA never becomes the inventory owner and never uses Realtime as settlement authority.

Receipt-aware template actions/rolls/spells/trade commands use stable `commandId` correlation so retries return the original result instead of spending twice. Internal/v1 template spend helpers are not exposed to authenticated clients.

### Oracle — GM imperative control plane

Every Oracle method has a predetermined owner:

```text
oracle.characters.*  → Shapoklyak
oracle.inventory.*   → Cheburashka
oracle.world.*       → Larisa
oracle.definitions.* → Chasovoy
```

The owner validates technical/domain integrity, persists the change, emits its canonical event and requests character resolution where appropriate.

### CE — pure calculator

CE resolves the supplied explicit snapshot. It performs no I/O, sends no commands and persists nothing.

### Cheburashka — inventory instance engine

Create/update/remove/equip/consume/transfer and character ↔ world-storage/Surface moves mutate only inventory-instance state. Reusable item definitions remain Chasovoy state. A physical item has one canonical owner scope; Larisa may decide whether a Surface is accessible, but it never owns the item row. Mechanical instance diffs request fresh character resolution for every affected character.

### Shapoklyak — character owner

Shapoklyak owns who exists and the persistent character mechanics/runtime facts attached to that entity. Legacy template helper RPCs are sealed behind the Shapoklyak owner facade; GM template assignment/removal reaches that facade through Oracle.

### Larisa — world owner

Larisa owns world hierarchy/topology, placement, discovery, scenes, current scene membership, scene Surface access/lifecycle, descriptive time and NPC habitats. Cheburashka owns the actual items on a Surface. Time alone never causes character resource/HP/effect changes.

### Tobik — roll boundary

Tobik/the authoritative Roll Engine owns requested randomness and structured roll output. It never applies HP or scene legality.

### Snake — UI interaction/action agent

Snake is the planned UI 1.0 interaction/control layer. It owns no canonical domain state. Entity/domain integrations provide available action manifests; Snake presents them through reusable surfaces and dispatches the chosen typed action into the already-authoritative path.

Examples:

~~~text
Player inventory action -> Snake -> GENA -> Cheburashka
GM location action -> Snake -> Oracle -> Larisa
approved narrow self-owned action -> Snake -> explicit owner facade
~~~

Snake must not infer mechanics from entity names/types, implement domain mutations, or turn a generic string command into unrestricted backend reflection. Full contract: docs/SNAKE_INTERACTION_CONTRACT.md.

## Communication laws

1. UI calls a control/owner contract and renders canonical/resolved state. UI is never engine-to-engine transport.
2. Normal gameplay enters through GENA when orchestration/history is needed; the specialized owner/storage boundary still owns the mutated fact.
3. GM-authoritative mutations enter through Oracle and go directly to the explicit owner.
4. Oracle never dynamically guesses a destination from a generic command; its method defines the owner.
5. An engine does not make another engine's tables its own storage. Cross-domain reads use explicit projections/contracts.
6. After a character-affecting canonical commit, the **owning engine calls the resolution requester directly**. It does not wait for CE, GENA or a UI surface to discover drift.
7. Chasovoy definition mutations use campaign-level invalidation because Chasovoy deliberately does not know concrete usages.
8. CE has no outbound arrows: no callbacks, polling, events or persistence.
9. One user intention keeps the same `commandId` through authoritative execution/invalidation where idempotency matters.
10. Supabase Realtime is a cross-client refresh transport, not a canonical command path.
11. Snake is UI interaction transport/orchestration, not a canonical owner: it may select/present/dispatch an action but cannot bypass the GENA / Oracle / owner laws that action requires.

## Canonical item sequences

GM authors/gives an item:

```text
GM Cabinet → Oracle → Chasovoy definition.create → D1
GM Cabinet → Oracle → Cheburashka inventory.create(instance → D1)
Cheburashka requests character resolution
resolver gets Shapoklyak state + Cheburashka projection + Chasovoy definitions
CE resolves
Sheet / Chat / Revolver render the same contract
```

Normal player use:

```text
Player → GENA → Cheburashka authoritative consume/use boundary
→ canonical inventory instance changes
→ Cheburashka invalidates character
→ shared runtime resolves again
```

If an instance reaches zero quantity, Cheburashka removes the instance. The Chasovoy definition remains.

Shared scene loot:

```text
GM → Oracle → Larisa creates/configures Surface
GM → Oracle → Cheburashka creates/places canonical loot instance
player action → GENA/explicit gameplay path → Cheburashka take_surface
Cheburashka transaction lock + item version decide the winner
Larisa Realtime invalidation tells other clients to refetch
```

A chat message never owns Surface loot. Realtime never chooses the winner.

Dedicated Trade:

```text
future Trade presentation
→ GENA TradeSession API
→ visibility / interest / offer revision / discussion / acceptance
→ on second acceptance of the same revision
→ Cheburashka atomic exchange
→ all physical transfers commit or none
```

Trade does not reserve inventory merely by referencing an item. External item changes invalidate the Trade revision. Physical currency is ordinary Cheburashka inventory.

## GM authority and HP

Damage/healing rolls are declarations/results only. Neither GENA, Tobik nor CE infers an HP mutation.

```text
GM: “Now this character has 3 HP”
→ GM Cabinet → oracle.characters.setHp
→ Shapoklyak persists 3 HP
→ Shapoklyak requests resolution
→ shared resolver → CE
→ all character surfaces refresh
```

The GM remains the final scene authority.
