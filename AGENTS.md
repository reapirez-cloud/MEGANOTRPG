# MEGANOTRPG agent instructions

These instructions are for coding agents and developers working in this repository. They are part of the repository contract, not player-facing documentation.

## Branch discipline — mandatory for all work

- **All active development starts and stays on `dev` by default.** This applies to every subsystem, not only classes or Character Engine work.
- Do not implement, patch, refactor, document, or otherwise write active development changes directly to `main`.
- Do not merge, copy, cherry-pick, or otherwise promote `dev` changes to `main` unless the user explicitly asks for that promotion in the current conversation.
- A request to implement/fix/change something is **not** permission to update `main`.
- A request such as “залей в main”, “слей в main”, “перенеси в main”, or another unambiguous release instruction is required before touching `main`.
- When the user asks to inspect, audit, discuss, or implement without explicitly authorizing `main`, work against `dev` and leave `main` unchanged.
- After implementation, report that the work is in `dev` and wait for the user's explicit decision about promotion to `main`.
- Repository instruction/documentation changes follow the same rule: update them in `dev` first unless the user explicitly authorizes a `main` update.

This branch rule has priority over older task-specific habits or prior requests to push directly to `main`.

## Named engine architecture — read before audits

Before auditing or changing chat gameplay, classes, resources, rests, preparation, inventory, character/NPC storage, sheets, world data, locations or maps, read `docs/ENGINE_ROADMAP.md`.

The roadmap is an **IN DEVELOPMENT architecture contract** and defines the intended engine boundaries:

- **CE — Character Engine:** deterministic character calculator; answers what the supplied character snapshot resolves to. CE does not query chat/DB or mutate game state.
- **GENA — Game State / Session Engine:** emerging gameplay coordinator/bookkeeper; records what players/GM declared, owns game-event/state mutation flows, resource spending/recharge, rests, post-rest preparation, stored choices/results, and rebuilds a fresh CE input after canonical state changes.
- **CHEBURASHKA — Inventory Engine:** planned dedicated inventory/item-state engine. Do not bury inventory ownership/state logic inside CE or chat UI.
- **PC/NPC Creation & Storage Engine — name TBD:** planned dedicated entity/lifecycle engine for player characters and NPCs. The final name must come from the Cheburashka cartoon universe; automated agents must not invent it.
- **Location / World Engine — name TBD:** planned dedicated world/location engine. The final name must come from the Cheburashka cartoon universe; automated agents must not invent it.

**The GM is the final scene rules engine.** Application engines help with bookkeeping and explicit machine-owned state; they do not enforce transient scene legality such as turn economy, target validity, range, line of sight, Echo position/presence, aura membership, or whether a declared action makes tactical/narrative sense. Do not report missing scene simulation as a mechanics defect unless the application explicitly owns that state.

For class audits, focus on machine-owned correctness: resource counts/costs/recharge, stored choices and refresh cadence, preparation results, class/subclass ownership and level semantics, canonical mutations, action/resource survival through migrations, and fresh CE reconstruction after mutations.

## Before touching character mechanics

If a task affects any of the following, read `docs/CHARACTER_ENGINE_CONTRACT.md` first:

- `src/character-engine/**`
- character sheet / character profile
- chat actions or chat character data
- inventory, equipment, item actions or item effects
- classes / subclasses / class features
- spells / spell slots / casting
- resources, rests, HP, saves, skills or derived stats
- GM-granted character features/effects

Also read `src/character-engine/README.md` before modifying the engine itself.

## Character Engine boundary

Character Engine (CE) is the mechanical source of truth for character-side state. UI must consume resolved CE data instead of re-parsing rule prose.

CE is a calculator/resource ledger, not a virtual GM or world-state simulator. Never invent authoritative state for scene facts the application does not actually track (weather, line of sight, whether a hit occurred, whether a corpse is nearby, once-per-turn without real turn tracking, and similar fiction/runtime facts).

## Generic mechanics before source-specific mechanics

Before adding a class, subclass, race, feat, item, or other source-specific subsystem, check whether the behavior belongs in a generic CE primitive.

Do not create a second choice runtime for feats, a class-specific resource engine, or UI-only mechanical truth when the same behavior can be represented through shared rule-template / CE infrastructure.

If a needed generic primitive does not exist, add the primitive first, document it beside the implementation, and then bind sources to it.

## Persistent choices

The canonical persistent choice runtime is `RuleChoiceDefinition.selection_mode = "player_once"` plus `resolveTemplateChoiceStates()` and the server RPC `commit_character_template_choice_v1`.

- `player_once` is opt-in. Existing choices remain manager-owned unless explicitly migrated.
- Player confirmation is explicit; selecting an option in UI must not silently lock it.
- Confirmed player selections are append-only. A later `count_by_level` increase may open only the missing slots; previous selections remain fixed.
- `requires_choice`, option unlock levels, counts, source levels and option membership are server-validated.
- GM/admin correction is an explicit administrative override, not ordinary player respec.
- Future feats and other sources with “choose one / choose N” clauses must reuse this runtime rather than inventing another selection system.

Before changing choices, read `src/rule-templates/AGENTS.md` and `src/rule-templates/CHOICE_RUNTIME.md`.

## Generic primitives still expected before large feat expansion

When a rule requires one of these behaviors, implement it generically rather than hardcoding the first feat/class that needs it:

1. **Dynamic option providers** — options derived from resolved CE state/catalog data, e.g. “choose a skill you are proficient in” or a spell from a specific list.
2. **Structured prerequisites** — character-owned requirements such as level, ability score, proficiency, spellcasting, an owned feature/source, or another feat. Scene/fiction requirements remain prose.
3. **Uniqueness / exclusion constraints** — “cannot choose an option already owned”, mutually exclusive selections, repeatable-vs-nonrepeatable sources, and cross-source duplicate policy.
4. **Allocation choices** — bounded numeric allocation such as `+2 to one ability` or `+1/+1 to two different abilities`, without enumerating fake combination options.
5. **Explicit change policy** — permanent, GM-only correction, or a real rule-defined respec cadence. Do not make choices freely mutable just because UI can edit JSON.
6. **Multi-stage dependent choices** — later selections may depend on earlier selections while using the same generic choice state/runtime.
7. **Feat source integration** — feats should become first-class CE/template sources and emit the same native contributions as classes/subclasses; do not model them as unrelated ad-hoc UI features.

Do not prebuild speculative mechanics that no rule needs yet. Add these primitives when the first real rule requires them, but add them generically at that time.

## Class/subclass work

Before changing class/subclass mechanics or presentation, read:

- `src/rule-templates/AGENTS.md`
- `src/rule-templates/CLASS_INTEGRATION_NOTES.md`
- `src/rule-templates/CLASS_WORK_STATUS.md`

Class mechanics are not READY merely because code exists. Follow the package quality gate, source-level semantics, server-authoritative resource mutation rules, and deployed-state verification defined there.

## Keep instructions discoverable

Architecture rules that materially affect future implementation should be recorded in repository instruction/docs adjacent to the relevant code, not only in chat, commit messages, or a temporary plan. Keep short pointer comments in central implementation files so an agent opening the code is directed to the full contract.
