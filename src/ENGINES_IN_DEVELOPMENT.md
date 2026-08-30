# Engines in development

> **ARCHITECTURE MARKER FOR CODE/AI AUDITS**
>
> These engine boundaries are intentional and are currently **IN DEVELOPMENT**.
> Read `../docs/ENGINE_ROADMAP.md` before refactoring gameplay state, classes, inventory, character/NPC persistence, world locations or maps.

Named engines:

- **CE — Character Engine**: deterministic character resolution from an explicit input snapshot. CE is passive: it does not query other engines, does not mutate persistence and does not announce changes.
- **GENA — Game State / Session Engine**: the central session orchestrator and gameplay bookkeeper. It records player/GM declarations, routes cross-domain play mutations to the owning engine, coordinates resource spending/recharge, rests, preparation, stored choices/results, visibility/discovery consequences and rebuilds a fresh CE input after canonical state changes. GENA is currently distributed across chat/runtime/RPC pieces and is planned to become an explicit engine boundary.
- **CHEBURASHKA — Inventory Engine**: dedicated inventory/item ownership and persistent item-state engine. It owns the warehouse: items, stacks, charges, equipment and transfers. It exposes only mechanically relevant item projections to CE snapshot construction. Planned/in development; do not grow inventory logic ad hoc inside CE or chat UI.
- **SHAPOKLYAK — PC/NPC Creation & Storage Engine**: separate engine for creation, identity, storage, assignment, visibility, discovery, placement and lifecycle of PC/NPC entities. Shapoklyak owns the existence and canonical identity/state of character entities; CE only resolves a supplied character snapshot.
- **LARISA — Location / World Engine**: separate engine for persistent worlds/zones/locations/maps, discovery/visibility, placement relationships and world topology. Larisa owns location state; GENA orchestrates play events that reveal, discover or move entities through that world.

## Critical engine communication boundary

**Engines communicate through explicit contracts/state, never through one another's UI.**

Bad:

```text
Chat UI → Sheet UI → Inventory UI → CE
```

Correct direction:

```text
UI → command → GENA / owning domain engine → canonical state → projections/snapshot → CE → presentation UI
```

Cross-domain play mutations should normally be orchestrated by GENA, while each specialized engine remains authoritative for its own state.

Example: when a grenade is used, GENA tells Cheburashka that the item was used. Cheburashka decrements/removes it. GENA then rebuilds the character snapshot. CE never tells Cheburashka that the grenade disappeared, and GENA should not directly edit inventory tables.

## Critical gameplay boundary

**The GM is the final scene rules engine and an authoritative source of canonical facts.**

The application may account for explicit machine-owned state (charges, costs, recharge, choices, preparation, levels, ownership) but should not become a tactical referee for transient scene facts such as action economy, positions, targets, range, line of sight, whether an Echo is present, aura membership, or whether a declared action makes sense.

Example: a player can spend an Echo-related charge while no Echo is present. GENA records/spends what the player declared; the GM decides that the action does nothing.

The GM may directly establish persistent truth: reveal an NPC through Shapoklyak, reveal/discover a location through Larisa, move a PC/NPC, edit stats/features/assignments, or set HP.

**HP is GM-authoritative.** Attacks, damage rolls, healing rolls, spells and item actions must not automatically mutate HP. The GM may run combat entirely in their head and update HP afterward. Absence of automatic combat HP application is intentional and must not be reported as a mechanics defect.

Do not report absence of scene simulation as a class-mechanics bug. Do report missing/wrong bookkeeping, persistence, refresh cadence, resource mutation, stored choices, wrong domain ownership, UI-mediated engine communication, or failure to rebuild CE after a canonical mutation.
