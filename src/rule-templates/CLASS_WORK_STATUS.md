# INTERNAL: Class work status ledger

> **REQUIRED MAINTENANCE FILE — developer/agent only. Never render or import this file into player UI.**
>
> This is the canonical checkpoint for class/subclass work. A text pass and a mechanics/runtime pass are separate closures. Never infer one from the other.

## Status rules

Allowed statuses:
- `NOT_STARTED` — work has not begun.
- `NOT_AUDITED` — implementation may exist, but no formal audit has started.
- `IN_PROGRESS` — layer is currently being built/audited or has known blockers.
- `READY` — the declared layer was explicitly audited with no known blockers in scope.
- `BLOCKED` — work cannot proceed until an external blocker is resolved.

When class/subclass content changes, update this file in the same work session. **TEXT READY does not mean MECHANICS READY.**

### Branch discipline

- Active class/runtime cleanup is performed on `dev`.
- Do not write class work directly to `main` unless an explicit merge/release step is requested.
- A mechanics layer is not `READY` merely because it exists in Git: the target deployment/database state must be audited separately.

---

## Canonical Reynar Voss voice

- `source: src/data/vossVoice.ts`
- `class_card_order: authorExplanation ("Восс объясняет") -> exact neutral rule -> authorComment ("Комментарий Восса")`
- `authorExplanation: in-world Voss observation/story; never a simplified mechanics paragraph`
- `authorComment: short personal Voss note after the exact rule; never a second rule block`
- `class_nuances: REMOVED — classes and subclasses do not render or store a separate "Нюансы Восса" layer`
- `exact_rule_boundary: all triggers, costs, targets, dice, ranges, durations, limits and adjudication belong to the exact rule, not narrator copy`
- `spell_boundary: class/subclass cleanup must not silently rewrite spell reference data or spell-specific authoring behavior`

---

## Mechanics/runtime audit contract

A class or subclass mechanic is not considered integrated merely because a feature description exists.

For mechanics `READY`, the end-to-end path must be verified:

1. `rule_templates / rule_template_levels / persistent choices` grant the mechanic at the correct effective class level.
2. `characterTemplateContributions()` emits native `CharacterContribution` entries.
3. Character Engine resolves them into the correct contract section:
   - active ability -> `ResolvedAction`;
   - finite pool -> `ResolvedResource`;
   - class/subclass spell -> `ResolvedSpellAccess`;
   - passive/triggered behavior -> native numeric/capability contribution or `ResolvedMechanicalRule.integration === "structured"`;
   - proficiency/resistance/immunity/sense/language -> corresponding CE capability.
4. `CharacterClassPanel` presents the resolved source without inventing mechanics from prose.
5. Every Class-tab entry has a stable machine category from `ClassMechanicEntryType`; display text never determines sorting type.
6. Resource-backed actions can persist their resource change through the class runtime RPC. Resource-less actions remain usable rules, but the UI must not show a fake state-changing button.
7. The deployed Supabase state must contain the same intended mechanical stack as the release target. Git-only implementation is not enough for `READY`.

Current stable presentation categories:
- `special_action`
- `class_spell`
- `resource`
- `passive_rule`
- `reference_rule`
- `proficiency`
- `resistance`
- `immunity`
- `sense`
- `language`

`reference_rule` is intentionally not proof of mechanical integration. It means the class tab can show the rule, but CE has no fully structured passive contract for that feature itself.

---

## Fighter (`class:fighter`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: substantial native runtime exists for base Fighter and subclasses through precision/completion/choice/Psi migrations and dedicated runtime tests`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Base Fighter: Second Wind, Action Surge, Tactical Mind, Tactical Shift, Indomitable, weapon mastery branches, Extra Attack scaling and ASI/feat choices.
- Arcane Archer: Arcane Shot choice options and shared use pool.
- Battle Master: superiority dice, maneuver selection, maneuver actions/effects and recovery.
- Cavalier: mark/protection/reaction behavior and finite uses where applicable.
- Echo Knight: echo creation/state, Unleash Incarnation and echo-dependent actions.
- Eldritch Knight: class spell access, preparation/replacement and shared slot accounting.
- Psi Warrior: Psionic Energy pool plus Protective Field, Psionic Strike, Telekinetic Movement and later actions.
- Rune Knight: rune choices, activations, Giant's Might resources and scaling.
- Samurai: Fighting Spirit uses and later action economy.
- Champion/Banneret: passive/numeric and shared-resource riders must resolve as CE mechanics rather than prose only.

Do not promote Fighter mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Druid (`class:druid`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: native Druid runtime/resource completion migrations and dedicated runtime tests exist`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Wild Shape: pool, recovery, transformation state, beast HP/stat replacement, overflow damage, duration, equipment and retained features.
- Wild Companion: alternative cost through Wild Shape or spell slot and class-tab action visibility.
- Spellcasting/preparation and class spell access.
- Primal Order, Elemental Fury and persistent branch choices.
- Wild Resurgence and Archdruid resource conversions.
- Circle of Land: daily land choice, always-prepared spells, Land's Aid and Nature's Ward.
- Circle of Stars: Star Map, Starry Form, Cosmic Omen and mode/resource state.
- Circle of Sea: Wrath of the Sea, aura ownership/radius and later upgrades.
- Circle of Wildfire: spirit creation/control/stat block and spirit-dependent actions.
- Dreams/Shepherd/Spores/Moon: finite pools, summoned/created creature hooks, reaction limits, temporary HP/aura behavior and subclass unlock compatibility.
- Legacy 2/6/10/14 rows must remain gated by the actual parent subclass unlock until deliberately normalized.

Do not promote Druid mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Cleric (`class:cleric`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: exact rules and spell/resource structure exist, but full fourteen-domain runtime coverage is not yet certified`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Base Cleric: cantrips/prepared spells/slots, Divine Order choice, Channel Divinity pool/recovery, Divine Spark, Turn/Sear Undead, Blessed Strikes persistent branch, Divine Intervention recovery.
- Domain spell groups: always-prepared source identity and shared slot spending.
- Nested Divine Order/Blessed Strikes choices: persistence and level gating.
- Every Wisdom/PB-scaled finite pool and reaction must have a real CE resource when uses are finite.
- Every Channel Divinity domain action must consume the shared canonical Channel Divinity resource.
- Arcana/Death/Forge/Grave/Knowledge/Life/Light/Nature/Order/Peace/Tempest/Trickery/Twilight/War must each be audited source-group by source-group.
- Legacy domain rows below class level 3 must be blocked by subclass unlock and must never grant early mechanics.

Do not promote Cleric mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Legacy builtin catalog reset

**Status:** `REMOVED_2026_08_29`

The previous generic implementations of these builtin classes and all of their attached subclasses were deliberately deleted from the live catalog and are not considered reusable implementation state:

- Artificer
- Bard
- Barbarian
- Warlock
- Wizard
- Monk
- Paladin
- Rogue
- Ranger
- Sorcerer

Reason: the old packages mixed useful fragments with generated summaries, vague descriptions and incomplete CE integration. Future work on these classes starts from a clean package and may consult historical migrations only as reference; it must not inherit a completion claim from the removed catalog.

Deletion is represented by the forward-only migration `20260829235500_remove_legacy_builtin_classes.sql`. The production application of that cleanup is recorded as `20260829184828_remove_legacy_builtin_classes`.

### Historical custom test class

`Жопка` is intentionally **untouched** by this reset. It is a non-builtin historical test/easter-egg class (`is_builtin=false`, no catalog key). Its future visibility/hiding behavior is a separate task and must not be changed as part of legacy builtin cleanup.

---

## Legacy bootstrap garbage audit

**Dev status:** `GUARDED_PENDING_DEPLOYMENT`

Live production inspection on 2026-08-29 found obsolete `campaigns` triggers capable of reinstalling the historical full class/subclass catalog and reapplying superseded Voss layers to newly created campaigns. The dev-only forward migration `20260830000500_retire_legacy_class_bootstrap_triggers.sql`:

- removes duplicate standalone official class/subclass installer triggers;
- retires the removed `Нюансы Восса` trigger;
- retires the rejected mechanics-paraphrase Voss explanation trigger;
- adds an assignment-safe final prune that keeps only builtin Fighter/Druid/Cleric;
- does not touch custom/non-builtin classes, including `Жопка`.

This guard is **not recorded as applied to production yet**. Do not claim the production bootstrap is clean until that deployment/database step is explicitly completed and re-audited.

---

## Future classes

Every removed builtin class is `NOT_STARTED` for the new architecture until its clean rebuild begins. New implementation must follow `CLASS_INTEGRATION_NOTES.md`, use stable source keys/types, reach CE end-to-end, and pass a package-specific quality/runtime audit before becoming visible as a finished class.
