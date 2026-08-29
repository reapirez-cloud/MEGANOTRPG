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
- `user_order: authorExplanation ("Восс объясняет") -> exact neutral rule -> authorComment ("Комментарий Восса")`
- `explanation_contract: Voss explains how to use the rule in plain in-world language for a reader who did not understand the exact rule; explanation never replaces the exact rule and never invents hidden mechanics`
- `comment_contract: short in-world field note after the rule; sarcastic, ironic, cynical, black humor; sometimes harsh; never a second mechanics paragraph`
- `worldview: distrusts magic as dangerous and needlessly complicated; respects practical nonmagical skill; likes Fighters; considers Clerics cowardly rear-line preachers; distrusts Druids and especially Circle of the Moon`
- `register_boundary: no modern office/legal/commercial/game-development register — no unions, insurance, licenses, HR, accounting, marketing, managers, office jokes, modern build/buff/statblock slang, Character Engine, runtime, parser, migrations, UI, editions or project history`
- `hard_boundary: Voss must never introduce dice, DCs, ranges, costs, durations, levels or exceptions that are absent from the exact rule text`
- `renderer_rule: an openable ability card reads authorExplanation/authorComment from feature payload; source groups without a feature grant use renderer-only mechanic.presentation fields`

---

## Fighter (`class:fighter`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `last_voss_audit: 2026-08-29`
- `reference_delivery: LIVE_SYNCED_2026_08_29`
- `production_migration: 20260829135656_fighter_cleric_voss_live_sync`
- `narration_contract: every rendered Fighter mechanic node now has authorExplanation -> exact rule -> authorComment; openable feature cards use the same order`
- `production_coverage_audit: 242/242 current Fighter + archetype mechanic nodes have authorExplanation and authorComment; missing_explanation=0; missing_comment=0; banned_modern_register=0`
- `voss_coverage_contract: every openable Fighter ability/source-group card has a separate Reynar Voss comment`
- `voss_coverage_audit: base Fighter and all ten current archetypes are live-synced; repeated generic archetype comments were replaced with archetype-specific narrator copy`
- `canonical_voss_voice: src/data/vossVoice.ts`
- `reference_ui: tappable full-rule cards; list cards are previews and open a dedicated full rule view`
- `production_delivery_rule: reference text/comment sync may update presentation text and renderer-only metadata only; it must not promote or rewrite exact rule descriptions/choices/resources/actions/formulas/effects/CE dependencies`
- `text_scope: base Fighter levels 1–20 + every currently catalogued Fighter subclass + nested selectable rules (Arcane Shots, Battle Master maneuvers, Rune Knight runes) + Voss explanations/comments + GM-facing summaries/descriptions`
- `text_definition_of_ready: a player/GM must be able to understand trigger/activation, cost, target, exact effect, numbers/dice/DC/range, duration and limits/recharge from the user-facing rule text whenever those parts apply; no "расширяет/усиливает возможности" placeholders; every openable ability card also has separate explanation and Voss note`
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

The green/ready mark is permitted **only for Fighter descriptions/reference copy and Voss author layers**. Do not describe the Fighter package as mechanically complete until `mechanics_status` is separately changed to `READY` after a dedicated audit.

---

## Druid (`class:druid`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `last_voss_audit: 2026-08-29`
- `reference_delivery: LIVE_SYNCED_2026_08_29`
- `production_migration: 20260829133921_druid_voss_live_sync`
- `narration_contract: every rendered Druid mechanic node now has authorExplanation -> exact rule -> authorComment; openable feature cards use the same order`
- `production_coverage_audit: 239/239 current Druid + Circle mechanic nodes have authorExplanation and authorComment; missing_explanation=0; missing_comment=0; banned_modern_register=0`
- `player_text_immersion_audit: READY_2026_08_29 — active player-facing Druid and Circle copy states only game rules; edition/source/project/runtime comparison language is forbidden and regression-tested`
- `canonical_voss_voice: src/data/vossVoice.ts`
- `circle_of_moon_voice_checkpoint: live template comment explicitly frames Moon Druids as deceptively cuddly and dangerous — "через минуту он ест вашу руку. Отдельную от вас"`
- `reference_ui: tappable full-rule cards; preview -> full detail; full detail order is Voss explanation -> exact rule/facts -> Voss comment`
- `production_delivery_rule: Druid live sync is presentation-only; it may update narrator/reference text and renderer-only metadata but must not promote or rewrite choices/resources/actions/formulas/effects/CE dependencies`
- `static_reference_audit: every druidReference.features entry has a plain explanation and Voss note; all player-visible static Druid strings are checked for developer/source-edition/modern-office leakage`
- `text_scope: static base-class reference + all eight currently catalogued circles + spell lists + selectable/variant rule text + scaling + failure/success clauses + Voss explanations/comments + GM-facing summaries/descriptions`
- `text_definition_of_ready: player/GM can resolve the human-facing rule from the reference text whenever trigger, action economy, cost, target/range, roll/save, exact effect, scaling, duration, ending condition and usage/recharge apply`
- `known_boundary: this closure certifies presentation/reference text and narrator coverage only; it does not certify Wild Shape runtime, subclass-level wiring, choices, resources, actions, formulas, source suppression, spell-slot accounting, summoned-creature runtime or other Character Engine behavior`
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

These notes **do not reopen the text layer**. They are explicit targets for the later mechanics audit. Edition/source compatibility notes belong here only and must never be copied into player-facing descriptions:

- Legacy subclass progression: Dreams, Spores, Shepherd and Wildfire still have legacy feature rows beginning at Druid level 2 while the base class currently unlocks its subclass at Druid level 3. Resolve the 2/6/10/14 versus 3/6/10/14 compatibility deliberately in mechanics; do not infer a level move from the text closure.
- Wild Shape: verify the project-pinned 2014 model end to end — exactly 2 uses, full short/long-rest recovery, beast HP and physical statistics, excess-damage carryover, form duration, equipment handling and retained-feature legality. Do not accidentally add the 2024 temporary-HP model.
- Circle of the Moon: verify Character Engine does **not** add the 2024 `3 × Druid level` temporary HP on top of the project beast-HP model. The active player rule states only the resulting mechanic and contains no edition comparison.
- Circle of the Land: verify Land’s Aid structured scaling matches the text contract `2d6 → 3d6 → 4d6`, and verify the daily land choice drives both always-prepared spells and Nature’s Ward resistance.
- Circle of Stars: verify Star Map free casts, Starry Form mode selection/switching, Cosmic Omen state and reaction uses against runtime resource/action semantics.
- Circle of the Sea: verify Wrath of the Sea targeting, successful-save zero effect, emanation radius upgrades, Stormborn benefits and Oceanic Gift ownership when the aura is placed on an ally.
- Circle of Wildfire: verify the Wildfire Spirit stat block, initiative/control, Flame Seed, Fiery Teleportation, lifetime and later spirit-dependent features as actual runtime behavior.
- Circle of Shepherd and Circle of Spores: verify summoned/created creature hooks, reaction limits, temporary HP, aura healing, corpse eligibility and duration handling; the text is authoritative for the intended human rule, not proof that CE currently enforces it.
- Base Druid: verify spell-slot and prepared-spell accounting, Primal Order choice, Elemental Fury persistent branch and level-15 upgrade, Wild Resurgence conversions, Beast Spells legality and Archdruid initiative/conversion rules.

### What “READY” means here

The green/ready mark is permitted **only for Druid descriptions/reference copy and Reynar Voss author layers**. Do not describe Druid gameplay mechanics as complete until `mechanics_status` is separately changed to `READY` after a dedicated audit.

---

## Cleric (`class:cleric`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `last_voss_audit: 2026-08-29`
- `reference_delivery: LIVE_SYNCED_2026_08_29`
- `production_migration: 20260829135656_fighter_cleric_voss_live_sync`
- `narration_contract: every rendered Cleric mechanic node now has authorExplanation -> exact rule -> authorComment; openable feature cards use the same order`
- `production_coverage_audit: 744/744 current Cleric + Domain mechanic nodes have authorExplanation and authorComment; missing_explanation=0; missing_comment=0; banned_modern_register=0`
- `text_scope: base Cleric levels 1–20 + all 14 catalogued domains + domain spell groups + Divine Order and Blessed Strikes nested choices + scaling/failure/success clauses + Voss explanations/comments + class/domain summaries and descriptions`
- `domain_text_audit: 14/14 domains included in the final closure and live narration sync`
- `feature_text_audit: closure gate requires 84/84 feature grants including the base hit-die card to have explicit non-placeholder descriptions`
- `voss_coverage_contract: every openable Cleric ability/source-group card has a separate Reynar Voss explanation and comment`
- `voss_coverage_audit: 156/156 current openable Cleric source groups remain covered; live recursive node audit additionally verifies 744/744 mechanic nodes`
- `canonical_voss_voice: src/data/vossVoice.ts`
- `reference_ui: tappable full-rule cards; preview -> full detail; full detail order is Voss explanation -> exact rule/facts -> Voss comment`
- `player_text_immersion_audit: class/domain summaries, explanations and Voss notes reject implementation, project, edition and modern office/legal/commercial language`
- `production_delivery_rule: the live Cleric narration sync is presentation-only; it may update author explanations/comments and renderer-only presentation metadata, but must not rewrite exact rule descriptions/resources/actions/formulas/effects/costs/choices/spell access/CE dependencies`
- `known_boundary: this closure certifies human-readable reference text only; structured spell slots, Channel Divinity accounting, domain actions/resources, choice persistence, source suppression and all other runtime behavior remain unaudited`
- `next_required_audit: full Cleric mechanics/runtime audit`

### Cleric domains — text layer

- Arcana Domain — `READY`
- Death Domain — `READY`
- Forge Domain — `READY`
- Grave Domain — `READY`
- Knowledge Domain — `READY`
- Life Domain — `READY`
- Light Domain — `READY`
- Nature Domain — `READY`
- Order Domain — `READY`
- Peace Domain — `READY`
- Tempest Domain — `READY`
- Trickery Domain — `READY`
- Twilight Domain — `READY`
- War Domain — `READY`

### Known mechanics-only follow-up

These notes **do not reopen the text layer** and must not leak into player-facing rules:

- Legacy domain rows: Arcana, Death, Forge, Nature, Order, Peace, Tempest and Twilight still contain some source rows numbered 1/2 while the parent subclass unlock is level 3. The parser/runtime audit must verify that the parent unlock gate prevents early mechanics; do not silently move structured rows during a text pass.
- Base Cleric: verify cantrip/prepared-spell/slot progression, long-rest preparation, Divine Order persistence, Channel Divinity maximum/recovery, Divine Spark scaling, Turn Undead/Sear Undead, Blessed Strikes branch persistence and Divine Intervention recovery in Character Engine.
- Nested choices: verify Divine Order and Blessed Strikes selections persist, unlock at the correct class level and apply only their selected mechanics; Voss coverage in the text closure is not proof of choice runtime correctness.
- Domain spell groups: verify always-prepared access, spell-class identity, slot spending and multiclass interaction separately. The reference text treats the lists as human-readable domain spell grants only.
- Domain finite-use features: verify all Wisdom/PB-scaled pools, reactions, rest recovery, spell-slot conversions and Channel Divinity costs as structured runtime resources/actions.
- Legacy early-level domains: text rules describe the abilities themselves; the later mechanics audit must decide whether the stored 1/2 row numbering should be normalized structurally or left behind the level-3 parent gate.

### What “READY” means here

The green/ready mark is permitted **only for Cleric descriptions/reference copy and Reynar Voss author layers**. Do not describe Cleric gameplay mechanics as complete until `mechanics_status` is separately changed to `READY` after a dedicated mechanics/runtime audit.

---

## Other classes

Add an explicit section when work begins. Absence from this ledger means **no completion claim may be inferred**.
