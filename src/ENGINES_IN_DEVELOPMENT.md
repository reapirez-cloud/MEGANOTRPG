# Engines in development

> **ARCHITECTURE MARKER FOR CODE/AI AUDITS**
>
> These engine boundaries are intentional and are currently **IN DEVELOPMENT**.
> Read `../docs/ENGINE_ROADMAP.md` and `../docs/ENGINE_CONTRACTS.md` before refactoring gameplay state, classes, rolls, inventory, character/NPC persistence, world locations, maps, time or quest-journal behavior.

Named engines:

- **CE — Character Engine**: deterministic character resolution from an explicit input snapshot. CE owns calculation only: no canonical storage, queries, persistence mutations, polling or announcements.
- **GENA — Game State / Session Engine**: the central session orchestrator and gameplay bookkeeper. It records player/GM declarations and routes cross-domain play mutations to the owning engine. Its explicit foundation now coexists with older chat/runtime/RPC pieces that are being consolidated.
- **TOBIK — Roll Engine**: shared authoritative dice engine. GENA requests a roll; Tobik returns the structured dice result; GENA records/presents it. Tobik does not decide scene legality, hits, damage application or HP mutations.
- **CHEBURASHKA — Inventory Engine**: dedicated inventory/item ownership and persistent item-state engine. It owns the warehouse: items, stacks, charges, equipment and transfers. It exposes only mechanically relevant item projections and directly requests a fresh resolution after mutation. Never pass the full backpack into CE.
- **SHAPOKLYAK — PC/NPC Creation & Storage Engine**: separate engine for creation, identity, storage, assignment, visibility, discovery, placement and lifecycle of PC/NPC entities. Shapoklyak owns the existence and canonical identity/state of character entities; CE only resolves a supplied character snapshot.
- **LARISA — Location / World + Campaign Time Engine**: separate engine for persistent worlds/zones/locations/maps, discovery/visibility, placement relationships, world topology and descriptive campaign chronology. Larisa may store world/chat time plus per-scene/per-character timeline stage, but time does not automatically trigger mechanics.

Not every feature needs an engine. **Quest Journal is intentionally a lightweight product module, not an engine**: GM-authored campaign quests and player-authored personal reminders/freeform tasks may coexist without becoming a rules authority.

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

Example: when a grenade is used, GENA tells Cheburashka that the item was used. Cheburashka decrements/removes it and directly requests fresh character resolution. The resolver obtains fresh projections and invokes CE. CE never stores or reports inventory drift, and GENA never edits inventory tables.

Example: when a roll is needed, GENA requests it from Tobik. Tobik returns the dice result; GENA records it. Do not implement separate source-specific randomness in class/item UI paths.

## Critical gameplay boundary

**The GM is the final scene rules engine and an authoritative source of canonical facts.**

The application may account for explicit machine-owned state (charges, costs, recharge, choices, preparation, levels, ownership) but should not become a tactical referee for transient scene facts such as action economy, positions, targets, range, line of sight, whether an Echo is present, aura membership, or whether a declared action makes sense.

Example: a player can spend an Echo-related charge while no Echo is present. GENA records/spends what the player declared; the GM decides that the action does nothing.

The GM may directly establish persistent truth: reveal an NPC through Shapoklyak, reveal/discover a location through Larisa, move a PC/NPC, edit stats/features/assignments, set campaign/world time, or set HP.

**HP is GM-authoritative.** Attacks, damage rolls, healing rolls, spells and item actions must not automatically mutate HP. The GM may run combat entirely in their head and update HP afterward. Absence of automatic combat HP application is intentional and must not be reported as a mechanics defect.

**Larisa time is descriptive by default.** Advancing a clock/date must not itself restore resources, expire effects, apply damage, move NPCs or mutate CE. It exists to preserve chronology and help the GM understand which stage/time each character occupies.

Do not report absence of scene simulation as a class-mechanics bug. Do report missing/wrong bookkeeping, persistence, refresh cadence, resource mutation, stored choices, wrong domain ownership, UI-mediated engine communication, duplicated roll logic, or failure to rebuild CE after a canonical mutation.
