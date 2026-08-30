# Engines in development

> **ARCHITECTURE MARKER FOR CODE/AI AUDITS**
>
> These engine boundaries are intentional and are currently **IN DEVELOPMENT**.
> Read `../docs/ENGINE_ROADMAP.md` before refactoring gameplay state, classes, inventory, character/NPC persistence, world locations or maps.

Named engines:

- **CE — Character Engine**: deterministic character resolution from an explicit input snapshot.
- **GENA — Game State / Session Engine**: gameplay bookkeeping/coordinator. Records player/GM declarations, resource spending/recharge, rests, preparation, stored choices/results and rebuilds a fresh CE input after canonical state changes. GENA is currently distributed across chat/runtime/RPC pieces and is planned to become an explicit engine boundary.
- **CHEBURASHKA — Inventory Engine**: dedicated inventory/item ownership and persistent item-state engine. Planned/in development; do not grow inventory logic ad hoc inside CE or chat UI.
- **PC/NPC Creation & Storage Engine — NAME TBD**: separate engine for creation, identity, storage, assignment, visibility and lifecycle of PC/NPC entities. Name will later be chosen from the Cheburashka cartoon universe. AI agents must not invent the final name.
- **Location / World Engine — NAME TBD**: separate engine for persistent worlds/zones/locations/maps and their relationships. Name will later be chosen from the Cheburashka cartoon universe. AI agents must not invent the final name.

## Critical gameplay boundary

**The GM is the final scene rules engine.**

The application may account for explicit machine-owned state (charges, costs, recharge, choices, preparation, levels, ownership) but should not become a tactical referee for transient scene facts such as action economy, positions, targets, range, line of sight, whether an Echo is present, aura membership, or whether a declared action makes sense.

Example: a player can spend an Echo-related charge while no Echo is present. GENA records/spends what the player declared; the GM decides that the action does nothing.

Do not report absence of scene simulation as a class-mechanics bug. Do report missing/wrong bookkeeping, persistence, refresh cadence, resource mutation, stored choices, or failure to rebuild CE after a canonical mutation.
