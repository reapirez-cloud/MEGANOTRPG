# INTERNAL: Class work status ledger

> **REQUIRED MAINTENANCE FILE — developer/agent only. Never render or import this file into player UI.**
>
> This file is the canonical checkpoint for class/subclass work. Any task that changes, audits, reopens, or closes a class/subclass layer MUST update this ledger in the same work session/commit series. Do not infer completion from migration names, old chat context, CI, or comments elsewhere.

## Mandatory update rule

Before touching a class or subclass:
1. Read this file and `CLASS_INTEGRATION_NOTES.md`.
2. Mark the layer being changed `IN_PROGRESS` if a previously closed layer is reopened.
3. Do the work.
4. Update this file before finishing: what changed, what is closed, what remains, and which layer must be audited next.
5. Never promote one layer because another layer is ready. **TEXT READY does not mean MECHANICS READY.**

Allowed statuses:
- `NOT_STARTED` — work has not begun.
- `IN_PROGRESS` — currently being built/audited or reopened by new work.
- `READY` — the declared layer was explicitly audited and has no known text blockers in its declared scope.
- `BLOCKED` — known blocker prevents closure; record it below.
- `NOT_AUDITED` — implementation may exist, but this layer has not been formally checked and must not be called ready.

When a future migration touches class/subclass content, add/update an internal header similar to:

```text
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
```

These are project-state markers, not player rules.

---

## Canonical Reynar Voss voice

- `source: src/data/vossVoice.ts`
- `scope: spells + classes + subclasses + future reference sections`
- `contract: short in-world field note; sarcastic, ironic, cynical, black humor; sometimes harsh; never a second mechanics paragraph`
- `hard_boundary: Voss must never introduce dice, DCs, ranges, costs, durations, levels or exceptions that are absent from the rule text, and must never mention Character Engine, runtime, parsers, migrations, implementation, UI, editions or project compatibility`
- `renderer_rule: an openable ability card may obtain its Voss note from feature.payload.authorComment or, for source groups without a feature grant, from renderer-only mechanic.presentation.authorComment`

---

## Fighter (`class:fighter`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `last_voss_audit: 2026-08-29`
- `reference_delivery: SYNCED_2026_08_29`
- `voss_coverage_contract: every openable Fighter ability/source-group card has a separate Reynar Voss comment`
- `voss_coverage_audit: 72/72 distinct Fighter feature sources explicitly mapped; 3/3 current non-feature source groups explicitly mapped; UI-equivalent target = 86/86 openable Fighter groups after production sync`
- `canonical_voss_voice: src/data/vossVoice.ts`
- `reference_ui: tappable full-rule cards; list cards are previews and open a dedicated full rule view`
- `production_delivery_rule: reference text/comment sync may update presentation text and renderer-only metadata only; it must not promote or rewrite choices/resources/actions/formulas/effects/CE dependencies`
- `text_scope: base Fighter levels 1–20 + every currently catalogued Fighter subclass + nested selectable rules (Arcane Shots, Battle Master maneuvers, Rune Knight runes) + Voss comments + GM-facing summaries/descriptions`
- `text_definition_of_ready: a player/GM must be able to understand trigger/activation, cost, target, exact effect, numbers/dice/DC/range, duration and limits/recharge from the user-facing rule text whenever those parts apply; no "расширяет/усиливает возможности" placeholders; every openable ability card also has a separate Voss note`
- `next_required_audit: full Fighter mechanics/runtime audit`

### Fighter subclasses — text layer

- Arcane Archer — `READY`
- Battle Master — `READY`
- Cavalier — `READY`
- Champion — `READY`
- Echo Knight — `READY`
- Eldritch Knight — `READY`
- Psi Warrior — `READY`
- Banneret — `READY`
- Rune Knight — `READY`
- Samurai — `READY`

### Known mechanics-only follow-up

These notes **do not reopen the text layer**. They are explicit reminders for the later mechanics audit:

- Echo Knight: verify that `Unleash Incarnation / Воплощение ярости` survives the final migration stack as its own mechanical feature/resource/action. Its full rule is deliberately preserved in the final GM-facing level-3 text even if the mechanical audit later finds a structural omission.
- Eldritch Knight: verify spell-slot/prepared-spell progression, multiclass slot interaction and replacement behavior against the Character Engine. The text pass only makes the intended progression explicit; it does not certify runtime accounting.
- Psi Warrior: the human-facing level-3 reference explicitly documents Protective Field, Psionic Strike and Telekinetic Movement, but their resources/actions/recovery are **not** mechanically certified by the text audit.
- Production legacy structure: the live database may still have empty/legacy choice structures for nested selectable rules. The reference delivery sync intentionally does not mutate those structures; Arcane Shot options, Battle Master maneuvers and Rune Knight runes are therefore included in full human-readable reference text until the mechanics audit addresses structure separately.
- All Fighter subclasses: finite resources, actions, formulas, replacement semantics, source suppression and runtime triggers remain outside this closure.

### What “READY” means here

The green/ready mark is permitted **only for Fighter descriptions/reference copy and Voss author comments**. Do not describe the Fighter package as mechanically complete until `mechanics_status` is separately changed to `READY` after a dedicated audit.

---

## Druid (`class:druid`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `last_voss_audit: 2026-08-29`
- `reference_delivery: SYNCED_2026_08_29`
- `voss_coverage_contract: every openable Druid ability/source-group card has a separate Reynar Voss comment`
- `voss_coverage_audit: 49/49 current feature-grant rows already carried comments; 20/20 non-feature source groups explicitly mapped; UI-equivalent target = 69/69 openable Druid groups after production sync`
- `canonical_voss_voice: src/data/vossVoice.ts`
- `static_reference_audit: every druidReference.features entry has a Voss note and is checked for developer-language leakage`
- `text_scope: static base-class reference + all eight currently catalogued circles + spell lists + selectable/variant rule text + scaling + failure/success clauses + Voss comments + GM-facing summaries/descriptions`
- `text_definition_of_ready: player/GM can resolve the human-facing rule from the reference text whenever trigger, action economy, cost, target/range, roll/save, exact effect, scaling, duration, ending condition and usage/recharge apply; every openable ability card also has a separate Voss author comment`
- `known_boundary: this closure certifies presentation/reference text and Voss coverage only; it does not certify Wild Shape runtime, subclass-level wiring, choices, resources, actions, formulas, source suppression, spell-slot accounting, summoned-creature runtime or other Character Engine behavior`
- `next_required_audit: full Druid mechanics/runtime audit`

### Druid circles — text layer

- Circle of Dreams — `READY`
- Circle of the Land — `READY`
- Circle of the Moon — `READY`
- Circle of the Sea — `READY`
- Circle of the Shepherd — `READY`
- Circle of Spores — `READY`
- Circle of Stars — `READY`
- Circle of Wildfire — `READY`

### Known mechanics-only follow-up

These notes **do not reopen the text layer**. They are explicit targets for the later mechanics audit:

- Legacy subclass progression: Dreams, Spores, Shepherd and Wildfire still have legacy feature rows beginning at Druid level 2 while the base class currently unlocks its subclass at Druid level 3. Resolve the 2/6/10/14 versus 3/6/10/14 compatibility deliberately in mechanics; do not infer a level move from the text closure.
- Wild Shape: verify the project-pinned 2014 model end to end — exactly 2 uses, full short/long-rest recovery, beast HP and physical statistics, excess-damage carryover, form duration, equipment handling and retained-feature legality. Do not accidentally add the 2024 temporary-HP model.
- Circle of the Moon: verify Character Engine does **not** add the 2024 `3 × Druid level` temporary HP on top of the project beast-HP model; the human rule deliberately excludes it.
- Circle of the Land: verify Land’s Aid structured scaling matches the text contract `2d6 → 3d6 → 4d6`, and verify the daily land choice drives both always-prepared spells and Nature’s Ward resistance.
- Circle of Stars: verify Star Map free casts, Starry Form mode selection/switching, Cosmic Omen state and reaction uses against runtime resource/action semantics.
- Circle of the Sea: verify Wrath of the Sea targeting, successful-save zero effect, emanation radius upgrades, Stormborn benefits and Oceanic Gift ownership when the aura is placed on an ally.
- Circle of Wildfire: verify the Wildfire Spirit stat block, initiative/control, Flame Seed, Fiery Teleportation, lifetime and later spirit-dependent features as actual runtime behavior.
- Circle of Shepherd and Circle of Spores: verify summoned/created creature hooks, reaction limits, temporary HP, aura healing, corpse eligibility and duration handling; the text is authoritative for the intended human rule, not proof that CE currently enforces it.
- Base Druid: verify spell-slot and prepared-spell accounting, Primal Order choice, Elemental Fury persistent branch and level-15 upgrade, Wild Resurgence conversions, Beast Spells legality and Archdruid initiative/conversion rules.

### What “READY” means here

The green/ready mark is permitted **only for Druid descriptions/reference copy and Voss author comments**. Do not describe Druid gameplay mechanics as complete until `mechanics_status` is separately changed to `READY` after a dedicated audit.

---

## Cleric (`class:cleric`)

- `text_status: IN_PROGRESS`
- `mechanics_status: NOT_AUDITED`
- `note: extensive GM-facing text exists, but this ledger has not yet recorded a dedicated final closure pass equivalent to Fighter`
- `next_required_audit: finish/confirm Cleric text closure, then audit mechanics separately`

---

## Other classes

Add an explicit section when work begins. Absence from this ledger means **no completion claim may be inferred**.
