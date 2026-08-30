# Oracle Engine Contract

## Purpose

Oracle is the GM's imperative control plane: the GM sees the world through the GM Cabinet and changes it through Oracle.

Oracle does not own game state. It does not decide what the rules allow. It does not route gameplay through Gena.

The governing model is:

```text
GM
├─ sees through GM Cabinet
└─ changes through Oracle
      ├─ Shapoklyak — characters/entities
      ├─ Cheburashka — inventory instances
      ├─ Larisa — runtime world state
      └─ Chasovoy — definitions/reference content
```

## Core law

**The GM declares the new reality. Oracle tells the owning engine to make that reality canonical.**

Examples:

- "The character now has 3 HP" → Oracle calls Shapoklyak directly.
- "Those grenades are gone from the backpack" → Oracle calls Cheburashka directly.
- "This location is discovered" → Oracle calls Larisa directly.
- "This custom item definition now exists" → Oracle calls Chasovoy directly.

Oracle does not ask Gena whether the change is legal under gameplay rules.

## Oracle is not Gena

Gena handles gameplay execution and orchestration: what happens when the game system resolves a normal action.

Oracle handles GM authority: what is true now because the GM said so.

These are parallel entry points. Oracle must never depend on Gena.

```text
normal gameplay                  GM authority

player/gameplay UI               GM Cabinet
       │                             │
       ▼                             ▼
     Gena                          Oracle
       │                             │
       ▼                             ▼
 domain engines                  domain engines
```

## Direct-owner rule

Every Oracle method has one explicit domain owner. Oracle does not dynamically choose an engine at runtime.

Examples:

```text
oracle.characters.setHp(...)       → Shapoklyak
oracle.inventory.remove(...)       → Cheburashka
oracle.world.moveCharacter(...)    → Larisa
oracle.definitions.create(...)     → Chasovoy
```

The owner engine remains responsible for:

- persistence;
- technical/domain invariants;
- canonical engine events;
- Character Engine invalidation/resolution requests when its canonical state affects mechanics.

Oracle does **not** emit a duplicate orchestration event. The command keeps the same `commandId`, so the owning engine event remains the durable/correlatable record of the GM change.

## What Oracle may reject

Oracle only accepts `gm` or `system` authority.

After that, Oracle does not enforce gameplay permission rules. Domain engines may still reject technically impossible or structurally invalid requests, for example:

- missing entity id;
- entity from another campaign;
- malformed data;
- impossible persistence operation;
- missing inventory item.

This is a domain integrity failure, not a gameplay-rule veto.

## State ownership

Oracle stores nothing.

- Character/entity canonical state → Shapoklyak.
- Inventory item instances/equipment/runtime → Cheburashka.
- Runtime world positions/discovery/scenes → Larisa.
- Class/subclass/item/spell/feat/etc. definitions → Chasovoy.
- Derived mechanics → Character Engine, recomputed from canonical inputs.

## Current surface

The initial Oracle surface exposes all currently existing direct GM mutations from those owners:

- characters: create, update, delete, active assignment, life state, visibility, NPC reveal, HP;
- inventory: create, update, remove, equip, consume, transfer;
- world: discovery, character position, scene position, participants, participant sync;
- definitions: create, revise, archive.

Oracle intentionally does not fake capabilities that the owner does not yet expose. For example, creating/editing map zones themselves belongs to Larisa, but Larisa currently exposes runtime location state rather than location-definition CRUD. That capability must be added to Larisa first and then exposed directly by Oracle.

## GM Cabinet rule

The GM Cabinet should be organized around what the GM sees and wants to change, not around backend engine names.

A character screen may show HP, inventory, position and abilities in one place. Its controls can call different Oracle surfaces under the hood. The GM does not need to know which engine owns each field.
