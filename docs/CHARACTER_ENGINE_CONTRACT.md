# Character Engine Integration Contract

This document defines the application-level contract between Character Engine (CE), persistence, Inventory, Character Sheet, Chat, classes, spells, and GM-granted mechanics.

It is mandatory reading before changing any system that consumes or mutates character mechanics.

---

## 1. One character, one mechanical truth

MEGANOTRPG must not have separate mechanical versions of the same character in Chat, Character Sheet, Inventory, or class UI.

The intended flow is:

```text
Authored/persisted sources
  - character base state
  - classes/subclasses
  - spells
  - inventory items
  - equipment state
  - GM-granted features/effects
  - runtime resource state
        |
        v
Integration adapters / runtime persistence
        |
        v
CharacterEngineInput
        |
        v
Character Engine
        |
        v
ResolvedCharacterContract
        |
        +--> Character Sheet
        +--> Chat classifier/UI
        +--> other character consumers
```

The pure engine under `src/character-engine/**` remains deterministic and does not query Supabase, React state, browser storage, or UI components by itself.

When this document says "CE stores/knows X", it means X belongs to the canonical character mechanics/runtime contract that feeds or is exposed by CE. Persistence is handled outside the pure engine.

---

## 2. What CE is responsible for

CE is responsible for resolving mechanical facts and current state, not for deciding UI layout.

The resolved character truth should be able to expose, directly or through stable provenance:

- abilities and modifiers;
- saving throws;
- skills and their governing abilities;
- HP and other runtime state;
- resources and current/max values;
- actions and attacks;
- spell access and casting methods;
- spell level and available payment/casting options;
- class/subclass feature provenance;
- racial, GM, item and other feature provenance;
- effects and suppressions;
- equipment state relevant to mechanics;
- active item actions/effects;
- enough semantic metadata for consumers to classify actions without guessing from names.

CE must not decide that an action belongs visually in `Attack`, `Class`, or `Unique`. That is presentation classification performed by Chat.

---

## 3. Inventory and equipment contract

### 3.1 Inventory owns the item

Inventory/persistence owns:

- item existence;
- authored item definition;
- quantity;
- item actions/effects;
- whether the item is currently carried/in inventory;
- whether the item is equipped;
- equipped slot when relevant;
- explicit activation rules such as "works while carried" or "works only while equipped".

### 3.2 CE does not need the whole backpack as active mechanics

CE may know/display that an item is carried or equipped, but inactive backpack contents must not become active mechanical contributions merely because they exist.

Examples:

- Longsword in backpack: exists and is carried, but its equipped attack/bonuses are inactive.
- Longsword equipped in a hand: its equipped attack and equipped effects may become active.
- Grenade in backpack with `available while carried`: its use action may be active even though it is not equipped.
- Special GM-authored relic with a passive carried effect: that effect may be active while carried only because the item explicitly says so.

The activation rule belongs to the item/action definition. Chat and CE must not infer it from the display name.

### 3.3 Equipment is a first-class character state

Equipment must be visible as its own resolved concept, not hidden as an incidental UI flag.

A future/extended resolved representation should be able to answer at least:

- which item is equipped;
- which slot it occupies, if slots apply;
- which item actions/effects are active because of that state;
- which carried actions/effects are active despite not being equipped;
- whether an item contribution is suppressed/disabled.

Do not hardwire the architecture only to classic D&D slots. Slot definitions should remain extensible/customizable.

---

## 4. Chat is not a rules engine

Chat has four jobs:

1. read the resolved character truth;
2. classify and sort what should be shown;
3. present actions clearly;
4. send explicit user-requested state-change commands back through the runtime/persistence boundary.

Chat must not maintain its own authoritative HP, spell slots, resources, equipment state, derived stats, or feature-use counters.

A typical state-changing flow is:

```text
Player presses a known action in Chat
        -> Chat identifies the canonical CE/runtime action/resource operation
        -> Chat requests the explicit state change
        -> persistence/runtime applies it
        -> CE resolves the new character state
        -> Chat and Character Sheet read the updated truth
```

Examples of command intent may include:

- spend resource;
- restore/add resource;
- cast spell using a selected allowed slot/resource;
- use a canonical action;
- equip item;
- unequip item;
- prepare/unprepare spell, if that operation belongs to the current ruleset.

The exact command API may evolve. The invariant does not: Chat requests the change; it does not become the owner of the changed state.

---

## 5. Chat classification is many-to-many

One underlying entity may appear in multiple places in Chat without duplicating its stored mechanics.

Chat classification must use semantic metadata/provenance, not display-name heuristics.

Useful independent dimensions include concepts such as:

- source kind: class, subclass, race, item, GM feature, other;
- entity kind: spell, action, resource, feature, item action;
- capability/tags: damage, attack, healing, utility, social, control, movement, etc.;
- spell level;
- class-granted / subclass-granted / always-prepared provenance;
- item role: weapon, consumable, equipment, other;
- availability state: equipped, carried, suppressed, unavailable;
- explicit sort order.

The final type names do not have to match these examples exactly, but the information must exist in stable machine-readable form.

### Example: mixed spell

A level 2 spell may be tagged both `damage` and `utility`.

The same canonical spell can therefore appear in:

```text
Attack -> Spells -> Level 2
Spells -> Level 2
```

If it is also class-granted/always prepared, it may additionally appear in:

```text
Class -> Class Spells -> Level 2
```

This is presentation reuse, not duplicated game state.

---

## 6. Required Chat hierarchy and sorting

A matching action must not be dumped into a flat list. Chat presents a hierarchy and sorts deterministically.

At minimum use a stable ordering rule equivalent to:

```text
group -> subtype/level -> explicit sort_order -> display name
```

Do not rely on database return order.

### 6.1 Dice / checks

The first area contains a free/manual die roller plus stat-based checks.

Structure:

```text
Dice / Checks
  Free roll
    d4 / d6 / d8 / d10 / d12 / d20 / d100 ...

  STR
    STR saving throw     +N
    Athletics            +N

  DEX
    DEX saving throw     +N
    Acrobatics           +N
    Sleight of Hand      +N
    Stealth              +N

  ...etc
```

The numbers come from CE resolved stats/saves/skills.

The skill-to-ability relationship must also come from canonical mechanical data, not from Chat hardcoding bonuses or recomputing them independently.

### 6.2 Attack

Structure:

```text
Attack
  Weapons
  Spells
    Cantrips
    Level 1
    Level 2
    ...
  Items
```

Rules:

#### Weapons

Show only weapon attack actions that are currently active for use.

For ordinary equippable weapons, this means the weapon is equipped.

A weapon merely present in the inventory/backpack must not appear here unless its authored action explicitly permits use while carried without equipping.

#### Spells

Show damage-capable spells.

Casting/payment options must use the same canonical casting/resource-options logic used elsewhere. Do not implement a second slot-upcasting mechanism just for Attack.

A mixed damage+utility spell may also appear in the normal Spells section.

#### Items

Show active item actions whose semantic purpose includes damage and which are currently usable according to their activation rule.

Examples include grenades, bombs, damaging consumables or unusual item actions.

Do not classify ordinary weapons into this item subgroup merely because weapons are technically inventory items; use the item's semantic role/action provenance.

### 6.3 Spells / Use Spell

Structure:

```text
Spells
  Cantrips
  Level 1
  Level 2
  Level 3
  ...
```

This area contains non-damage spell use and mixed-use spells.

Rules:

- pure damage-only spells can remain Attack-only if the authored semantics say they have no non-combat/utility use;
- non-damage spells appear here;
- mixed damage+utility/social/control/etc. spells appear here and may also appear under Attack;
- available higher-level slot/resource casting options come from the canonical CE casting model.

### 6.4 Class

Class placement is based primarily on provenance/source, then sorted into meaningful subgroups.

Structure:

```text
Class
  Unique Class Features
    Wild Shape
    Channel Divinity
    Metamagic
    Second Wind
    ...

  Class Spells
    Cantrips
    Level 1
    Level 2
    ...
```

Class and subclass are mechanically distinct sources even if they are visually related.

Class-granted/always-prepared spells may appear here while still appearing in Attack or Spells when their capabilities match those sections.

### 6.5 Unique

This is for active mechanics that do not belong naturally to the ordinary Class/Spell/Attack grouping, especially by source.

Prefer sorted source groups rather than one flat pile, for example:

```text
Unique
  Race
  GM Features / Special Effects
  Items
  Other
```

An entity may still also appear elsewhere when appropriate.

Example: a racial breath weapon can appear in `Unique -> Race` and also in `Attack` if it has an attack/damage action.

---

## 7. Multi-action items and ambiguous effects

A single item may contain many actions/effects: damage, healing, flight, risk, random outcome, or GM-resolved behavior.

Chat must distinguish between:

- selecting a specific canonical action;
- using/linking the item as a broad entity.

### Specific action selected

If the player entered through a specific known action, Chat may invoke that canonical action and its known explicit resource/state operation.

Example:

```text
Attack -> Items -> Fire Bomb -> Throw
```

The context is specific enough to use the corresponding damage action.

### Broad item selected

If the player presses an item in `Unique` and the item has several possible effects that the player/GM must choose or resolve, Chat must not create an unnecessary effect-selection rules engine.

Expected behavior is equivalent to:

```text
Item used — player chooses effect.
[linked item card / item reference]
```

The item description/mechanics remain accessible through the link/card.

Do not make Chat decide ambiguous outcomes it is not responsible for resolving.

---

## 8. Resource synchronization

Resources have one canonical runtime state.

If an action spends or adds a resource:

```text
Chat action
  -> explicit resource/state command
  -> canonical runtime persistence changes
  -> CE resolves current value
  -> all consumers observe the same value
```

Never keep a second Chat-only counter.

Example:

```text
Second Wind: 1/1
Player uses it in Chat
Runtime becomes 0/1
Character Sheet shows 0/1
Chat shows 0/1
Short rest restores it through canonical rules
Both surfaces show 1/1
```

Avoid synchronization loops where a resolved value is repeatedly written back simply because representation/order differs. Semantic equality must be used for structured state; JSON object key order is not a meaningful change.

---

## 9. Character Sheet contract

Character Sheet is another presentation of the same resolved character truth.

It may organize information differently from Chat, but it must not independently rebuild a conflicting set of stats/resources/actions.

Important invariant:

> If Chat says a resource is 0/1, Character Sheet must not say 1/1 from another local source.

The same applies to equipment, spell availability, class feature uses, HP and other canonical mechanical state.

---

## 10. Source systems and ownership

Use this ownership model when designing changes:

### Classes / subclasses

Own authored class/subclass definitions, grants, features, progression and source provenance.

They feed CE; Chat does not query class descriptions and invent mechanics from prose.

### Spells

Own authored spell definitions, level and semantic mechanics/tags.

Preparation/access/current casting resources are part of character state resolved through CE/runtime.

### Inventory

Own item definitions and possession/equipment persistence.

Only mechanically active item contributions/actions are activated in the resolved character mechanics according to explicit rules.

### GM features/effects

Own their authored source definition and explicit mechanics.

They should carry provenance so consumers can group them correctly without name guessing.

### Character Engine

Resolves these sources and runtime facts into one mechanical contract.

### Chat / Character Sheet

Consume that contract. They do not become competing rules engines.

---

## 11. Anti-patterns

Do not introduce any of the following:

### Name-based classification

Bad:

```ts
if (item.name.includes("sword")) showInWeapons()
```

Use explicit semantic metadata instead.

### One-category-only entities

Bad:

```ts
chatCategory: "class"
```

when that prevents the same class-granted damaging spell from appearing in Attack and Class.

Prefer independent traits + many-to-many presentation classification.

### Entire inventory as active CE mechanics

Possession is not activation.

A backpack sword must not grant an equipped sword attack/bonus.

### Chat-owned resources

Do not decrement a local Chat counter and hope CE catches up later.

### UI-owned formulas

Do not recalculate saves, skills, attack bonuses, spell availability or resource maxima independently in Chat.

### Duplicated casting logic

Attack-spell casting and normal spell casting must share canonical CE/resource-option logic.

### Ambiguous item wizard

Do not force Chat to ask the player to resolve every sub-effect of a complex item when the intended UX is simply "item used; player chooses/resolves the effect".

### Hidden order-dependent global state

Do not rely on unrelated components mounting first merely to populate a registry required for another consumer. Prefer an explicit canonical character runtime/snapshot dependency.

---

## 12. Implementation checklist for AI agents

Before changing Chat, Inventory, Character Sheet, classes, spells, or CE integration, answer these questions:

1. What system owns the authored source?
2. What system owns the mutable runtime state?
3. What data must CE receive to resolve the character correctly?
4. What should be exposed in `ResolvedCharacterContract` instead of recomputed by the consumer?
5. Is the mechanic active while equipped, carried, or under another explicit condition?
6. Can one entity legitimately appear in multiple Chat sections?
7. What deterministic subgroup/sort key should Chat use?
8. If the player presses it, is Chat invoking a specific action or merely linking/announcing use of the broader entity?
9. Does the action spend/add a canonical resource? If so, is the update sent through the runtime/persistence boundary rather than stored locally?
10. Will Character Sheet and Chat observe the exact same result after the state change?

If any answer is unclear, do not patch around the ambiguity in the UI. Fix or extend the integration contract/data model first.
