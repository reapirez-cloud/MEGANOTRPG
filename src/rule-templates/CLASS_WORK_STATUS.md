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

`GM_ADJUDICATION_BOUNDARY.md` is part of this contract. A precise rule can be mechanically complete with GM-adjudicated execution when the app does not own the required scene/action/transaction state. Do not treat missing bespoke automation for such a rule as a mechanics blocker.

For mechanics `READY`, the end-to-end path must be verified:

1. `rule_templates / rule_template_levels / persistent choices` grant the mechanic at the correct effective class level.
2. `characterTemplateContributions()` emits native `CharacterContribution` entries.
3. Character Engine resolves them into the correct contract section:
   - active ability -> `ResolvedAction` when the app has an actionable/rollable surface to expose;
   - finite pool -> `ResolvedResource`;
   - class/subclass spell -> `ResolvedSpellAccess`;
   - passive/triggered behavior -> native numeric/capability contribution or `ResolvedMechanicalRule.integration === "structured"` when CE owns the relevant character-side fact;
   - proficiency/resistance/immunity/sense/language -> corresponding CE capability.
4. `CharacterClassPanel` presents the resolved source without inventing mechanics from prose.
5. Every Class-tab entry has a stable machine category from `ClassMechanicEntryType`; display text never determines sorting type.
6. Resource-backed actions can persist their resource change through the class runtime RPC. Resource-less actions may remain repeatedly invokable; Action/Bonus Action/Reaction and per-turn legality are adjudicated by the GM unless a separate authoritative runtime exists.
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

- `last_text_audit: 2026-09-03`
- `voss_class_subclass_feature_voice_pass: VOSS_SOLDIER_RESPECT_DISCIPLINE_COST_WITH_DISTINCT_ARCHETYPES_2026_09_02`
- `current_dev_text: Brant base narration plus all four accepted Fighter Gemini subclass packs are restored as the active layered narration chain; every active archetype preview/feature can resolve through fighterVossNarration.ts and ReferenceGuide now also consumes dedicated Fighter feature comments`
- `translation_wiring_audit: ACTIVE_CHAIN_RESTORED_FROM_MAIN_2026_09_03`
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

Action/Bonus Action/Reaction availability, per-turn attack counts and other turn-economy legality in Fighter features are GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`; they are not reasons to add a turn tracker.

Do not promote Fighter mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Druid (`class:druid`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-09-03`
- `voss_class_subclass_feature_voice_pass: BATTLEFIELD_DUALITY_DRUID_HORROR_CANON_2026_09_02`
- `current_dev_text: canonical Voss battlefield narration rewritten for base Druid, all eight circles and their feature cards; exact rules unchanged`
- `translation_wiring_audit: DEV_AND_MAIN_ACTIVE_AGGREGATOR_IDENTICAL_2026_09_03`
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

Scene legality, reaction/action availability and `once per turn` execution remain GM-adjudicated unless the application later gains an explicit authoritative turn/runtime system.

Do not promote Druid mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Cleric (`class:cleric`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-09-03`
- `voss_class_subclass_feature_voice_pass: GRIMDARK_REARLINE_COWARD_PREJUDICE_WITH_DOMAIN_EXCEPTIONS_2026_09_02`
- `current_dev_text: canonical Voss narration rewritten for the base Cleric, all fourteen supported domains and every active domain feature; class-wide distrust centers on rear-line cowardice while individual domains earn distinct contempt or grudging respect; exact rules unchanged`
- `translation_wiring_audit: DEV_AND_MAIN_ACTIVE_AGGREGATOR_IDENTICAL_2026_09_03`
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

Reaction/action availability and scene-trigger validity remain GM-adjudicated; CE owns the finite pools and durable character-side results it can actually know.

Do not promote Cleric mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Wizard (`class:wizard`)

**Text:** `READY`  
**Mechanics/runtime:** `READY`

- `last_text_audit: 2026-09-03`
- `voss_base_class_feature_voice_pass: JOHANN_BASE_PLUS_LAYERED_GEMINI_SUBCLASS_PACKS_2026_09_03`
- `translation_wiring_audit: RESTORED_JOHANN_AND_GEMINI_PACKS_1_2_3_4_IN_DEV_2026_09_03`
- `last_mechanics_audit_started: 2026-08-31`
- `last_dev_runtime_audit: 2026-09-02`
- `last_deployed_runtime_audit: 2026-09-02`
- `rules_revision: Player's Handbook 2024 base class plus the declared compatibility revisions for all 13 supported subclasses`
- `subclasses: READY_ALL_13_RUNTIME_PACKAGES`
- `subclass_wave_0: READY_2026_08_31`
- `subclass_supported_count: 13`
- `subclass_contract: src/rule-templates/wizardSubclasses.ts`
- `subclass_contract_regression: tests/wizardSubclassWave0.test.ts`
- `dev_base_class_runtime: READY`
- `dev_subclass_runtime_revision: wizard-subclasses-runtime@3`
- `current_dev_text: player-facing Wizard narration now resolves from wizardVossNarrationJohann.ts for the base class and the layered Gemini subclass packs before falling back to the curated base subclass source; pack 2 includes the accepted Vitold/Bruno/Gorn literary pass, while Order of Scribes remains known literary debt rather than a runtime blocker`
- `current_dev_runtime: physical spellbook and book-gated preparation remain authoritative; base Wizard plus Abjurer, Diviner, Evoker, Illusionist, Enchantment, Conjuration, Necromancy, Transmutation, War Magic, Bladesinging, Order of Scribes, Graviturgy and Chronurgy are implemented through the shared template/CE/action/spell/resource pipeline`
- `starting_equipment_policy: NONE_CLASS_AUTHORED_GM_PROVIDES_GEAR`
- `gena_rest_window_policy: FIRST_ASSIGNED_PLAYER_MESSAGE_OF_ANY_KIND_CLOSES_OPEN_POST_REST_WINDOWS`
- `spellbook_regression: tests/wizardSpellbookRuntime.test.ts`
- `spellbook_progression_regression: tests/wizardSpellbookProgressionRuntime.test.ts`
- `arcane_recovery_regression: tests/wizardArcaneRecoveryRuntime.test.ts`
- `completion_regression: tests/wizardCompletionRuntime.test.ts`
- `base_closure_regression: tests/wizardBaseClosure.test.ts`
- `subclass_runtime_regression: tests/wizardSubclassRuntime.test.ts`
- `subclass_sql_parity_regression: tests/wizardSubclassSqlRuntime.test.ts`
- `production_runtime: DEPLOYED_AND_CERTIFIED_2026_09_02`
- `production_subclass_count: 13`
- `production_subclass_revision: wizard-subclasses-runtime@3`
- `production_level_rows: CERTIFIED_3_6_10_14_FOR_EACH_SUBCLASS`
- `catalog_bootstrap: dev migration preserves class:wizard and installs the clean base class for new campaigns`
- `gm_adjudication_policy: FOUND_SPELL_TRANSCRIPTION_AND_SIMPLE_SHEET_CHOICES_ARE_MANUAL_BY_DESIGN`

### Dev base-class closure

- Spellbook as authoritative owned-spell state: physical item identity, held-book access, six starting level-1 spells and two additional eligible Wizard spells per later Wizard level are implemented and regression-gated. Class-authored starting equipment is intentionally empty; the GM supplies all gear.
- Prepared Wizard spells are selected only from the actual held spellbook and obey the fixed 2024 prepared-spell progression. Spell Mastery and Signature Spells remain always prepared and are excluded from the ordinary Gena preparation quota.
- Full-caster spell-slot capacity is emitted as native CE resources through the shared parser-owned slot primitive. Ordinary Wizard slot casting now requires preparation and uses the canonical slot-resource path.
- Ritual Adept is implemented in dev: an eligible ritual in the currently held physical Wizard spellbook exposes a no-preparation, no-slot ritual method; losing access to that book removes the ritual access from the next CE snapshot.
- Rest resources recover immediately when the GM grants the corresponding rest. Gena then exposes the available post-rest decisions; Wizard-specific rest-choice RPCs persist state directly and do not insert chat messages.
- The assigned player's first chat message for that PC, regardless of body/event kind, closes both open Short Rest and Long Rest post-rest choice windows. Choices already saved remain saved; optional choices not taken before the message are skipped for that rest generation.
- Arcane Recovery is implemented with one long-rest resource, GM-authoritative Short Rest window, `ceil(Wizard level / 2)` weighted recovery budget, level-5 ceiling, spent-slot validation and shared `spell_slot_N` persistence. Its recovery allocation is exposed in Gena during the Short Rest window.
- Memorize Spell is implemented through the authoritative Short Rest window and can replace one eligible prepared level-1+ Wizard spell with another eligible spell from the actual held spellbook; the choice is exposed directly in Gena.
- Long-rest cantrip replacement is a real once-per-long-rest server transaction exposed in Gena. The level-based cantrip-count progression itself remains ordinary sheet/class progression and does not require a Wizard-specific picker.
- Spell Mastery is implemented with one level-1 and one level-2 held-book selection, Action casting-time validation, always-prepared access, true no-resource lowest-level casting and at most one mastered-spell replacement after each Long Rest. The rest-window replacement is exposed in Gena.
- Signature Spells are implemented with two level-3 held-book selections, always-prepared access, separate free-cast resources and independent Short/Long Rest recovery. Player replacement after the initial selection is not allowed; an uninitialized level-20 choice is exposed in Gena.
- Scholar uses the agreed informational path: Gena tells the player that Scholar is available; the player chooses an eligible already-proficient skill and asks the GM to raise it to Expertise through the ordinary sheet editor. No dynamic Wizard option provider or feature-specific RPC is required.
- ASI and Epic Boon do not receive a Wizard-specific picker. They use the generic feat/allocation contract when available or the normal GM sheet-edit path; lack of Wizard-specific automation is not a base-class runtime blocker.
- Found-spell/scroll transcription, its gold/time procedure, consuming/removing the source, replacement of a lost book and backup-book narrative handling are **GM-adjudicated by design**. The GM uses normal inventory/currency/spellbook tools and CE/Gena stores the durable result.
- Multi-book progression UI now mirrors the server rule: a level-progression spell already written in any held Wizard spellbook is not offered again, while the GM's direct per-book grant flow may still target another book where appropriate.
- Action/Bonus Action/Reaction legality and per-turn cadence inside Wizard rules remain GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`; CE exposes real resources/access but does not create a turn tracker.
- The rebuilt base class remains independent of subclass content; Wizard subclass infrastructure and package gates are tracked separately below.

### Wizard subclasses

- The catalog defines and now installs exactly thirteen supported Wizard subclass identities from `wizardSubclasses.ts` and `wizardSubclassMechanics.ts`.
- Every package attaches to the active `class:wizard` template, unlocks at Wizard level 3 and places compatibility feature rows only at Wizard levels 3/6/10/14.
- The generic template resolver remains authoritative for effective subclass level. A stale/high subclass assignment or high total character level cannot unlock subclass mechanics before the parent Wizard reaches the required level.
- The four PHB 2024 identities (Evoker, Diviner, Illusionist, Abjurer) replace their same-school 2014 variants rather than creating duplicate subclasses.
- Older supported schools and supplement subclasses keep their original rules package but use the Wizard 2024 compatibility schedule: a former level-2 subclass entry feature is exposed at Wizard level 3; later 6/10/14 rows retain their levels.
- Stable catalog keys, visual keys, source labels and rules revisions are preserved for all thirteen packages; identity never depends on translated display names.
- Finite rest-recovering pools and durable deterministic facts are CE/Shapoklyak state. Per-turn cadence, targets, corpses, visibility, range, concentration, summoned creatures and other scene facts remain explicit structured rules/actions adjudicated by the GM.
- War Magic and Chronurgy use the generic formula contribution for Dexterity + Intelligence initiative. Power Surge uses the generic exact-value `set` recovery rule and returns to exactly 1 after a Long Rest.
- Free subclass casts that spend non-slot resources are exposed as resource-backed class actions; canonical `class_spell` accesses continue to spend only ordinary spell slots.
- The deployed campaign contains 13 active builtin Wizard subclass templates at revision `wizard-subclasses-runtime@3`, each with exactly the 3/6/10/14 rows. The deployed spell contract reports zero invalid method kinds and zero non-slot class-spell costs.
- Regressions in `tests/wizardSubclassWave0.test.ts`, `tests/wizardSubclassRuntime.test.ts` and `tests/wizardSubclassSqlRuntime.test.ts` guard identity, effective level, CE behavior, resource/state boundaries and SQL/TypeScript payload parity.

There are no known Wizard implementation or deployment blockers in the declared 13-subclass scope. Order of Scribes remains an explicitly accepted literary debt only.

---

## Bard / Paladin reference layer

**Exact reference text:** `READY_CURRENT_AUTHORED_ROSTERS_2026_09_04`
**Mechanics/runtime:** `NOT_STARTED`

- Bard and Paladin base cards plus every currently authored subclass card now resolve a non-empty exact-rule description through `src/data/classes/referenceMechanics.ts`.
- Missing translated base features are visible as English-named cards with an explicit translation note; no Voss prose is synthesized for them.
- These entries remain `referenceOnly`; no Chasovoy template, resource, action, spell access or Character Engine contribution is activated by this reference pass.

---

## Monk (`class:monk`)

**Text:** `READY_AUTHORING_SCOPE`  
**Mechanics/runtime:** `IN_PROGRESS`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/monkReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/monkSubclassReferenceDraft.ts; src/data/classes/monkSubclassReferenceDraftWave2.ts; src/data/classes/monkSubclassReferenceDraftWave3.ts; src/data/classes/monkSubclassReferenceDraftWave4.ts`
- `authoring_closure: src/data/classes/monkAuthoringClosure.md`
- `current_dev_text: Brother Korn base narration plus all ten declared WotC-scope literary identities are authored; Cobalt Soul / Sister Valeria and Living Weapon / Brother Goran are preserved as additional partner/third-party-adjacent authoring drafts pending independent source eligibility review`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `last_mechanics_audit_started: 2026-09-04`
- `dev_base_class_runtime: IMPLEMENTED_AND_REGRESSION_GATED_2026_09_04`
- `dev_subclass_runtime: BATCH1_IMPLEMENTED_4_OF_10_WOTC_SCOPE_2026_09_04`
- `dev_subclass_runtime_revision: xphb-2024-monk-subclasses-batch1-v1`
- `subclass_batch1: mercy, shadow, elements, open-hand`
- `subclass_batch1_feature_levels: 3,6,11,17`
- `subclass_batch1_shared_resource: monk_focus`
- `subclass_batch1_regression: tests/monkSubclassBatch1.test.ts`
- `base_runtime_regressions: tests/monkOfficialPack.test.ts; tests/monkRuntimeCompletion.test.ts`
- `runtime_visibility: DEV_MIGRATIONS_ACTIVE_PENDING_DEPLOYMENT_AUDIT`
- `class_reference_visibility: ACTIVE_REFERENCE_ONLY; Korn narration and exact reference rules remain the presentation source while runtime templates carry CE mechanics separately`
- `subclasses: LITERARY_SCOPE_COMPLETE_10_OF_10_PLUS_2_OPTIONAL; RUNTIME_4_OF_10_WOTC_SCOPE`
- `authored_wotc_scope: open-hand, shadow, drunken-master, elements, mercy, kensei, ascendant-dragon, astral-self, sun-soul, long-death`
- `remaining_runtime_wotc_scope: drunken-master, kensei, ascendant-dragon, astral-self, sun-soul, long-death`
- `optional_authoring_candidates: cobalt-soul, living-weapon`
- `source_policy: subclass source labels copied from the user are planning hints only and must be independently verified during each mechanics batch`
- `mechanics_policy: CE owns persistent Focus and finite rest-recovering uses; scene/target/light/turn legality remains GM-adjudicated when the app lacks authoritative state; subclass packages reuse the base monk_focus pool rather than duplicating it`
- `production_runtime: NOT_CERTIFIED_FOR_CURRENT_DEV_MONK_STACK`

Base Monk and the first four 2024 subclass runtime packages are implemented in `dev`, but Monk mechanics remain `IN_PROGRESS` until the remaining declared runtime batches are built and the intended deployed state is audited.

---

## Sorcerer (`class:sorcerer`)

**Text:** `READY_AUTHORING_SCOPE`  
**Mechanics/runtime:** `NOT_STARTED`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/sorcererReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/sorcererSubclassReferenceDraft.ts; src/data/classes/sorcererSubclassReferenceDraftWave2.ts; src/data/classes/sorcererSubclassReferenceDraftWave3.ts; src/data/classes/sorcererSubclassReferenceDraftWave4.ts`
- `authoring_plan: src/data/classes/sorcererAuthoringPlan.md`
- `current_dev_text: Luka base narration plus the nine originally planned Sorcerer identities are authored; Runechild / Kazimir, Phoenix / Marfa and Stone / Gordey are additionally preserved as extended candidates`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `runtime_visibility: NOT_ACTIVE`
- `class_reference_visibility: ACTIVE_REFERENCE_ONLY`
- `subclasses: COMPLETE_9_PLANNED_PLUS_3_EXTENDED_AUTHORED`
- `planned_authored: aberrant-sorcery, clockwork-sorcery, draconic-sorcery, wild-magic, divine-soul, shadow-magic, storm-sorcery, lunar-sorcery, pyromancer`
- `extended_candidates: runechild, phoenix-sorcery, stone-sorcery`
- `source_policy: source/publication labels in literary copy are non-authoritative; Plane Shift, partner/community and UA eligibility must be independently verified before runtime inclusion`
- `mechanics_policy: exact reference rules are present; Sorcery Point/Metamagic resources, CE actions/choices and runtime package remain a separate future implementation before activation`

The authored Sorcerer reference is visible through `classReference`, but it must not be imported into Chasovoy runtime templates or Character Class runtime UI until source eligibility, resources/actions/choices and package-quality tests are complete enough for activation.

---

## Warlock (`class:warlock`)

**Text:** `IN_PROGRESS`  
**Mechanics/runtime:** `NOT_STARTED`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/warlockReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/warlockSubclassReferenceDraft.ts; src/data/classes/warlockSubclassReferenceDraftWave2.ts; src/data/classes/warlockSubclassReferenceDraftWave3.ts`
- `authoring_plan: src/data/classes/warlockAuthoringPlan.md`
- `current_dev_text: base Warlock Voss narration follows the abandoned drummer Michel; eight patron identities are now authored — Emil / Archfey, Brun / Fiend, Sibylla / Great Old One, Zakhar / Celestial, Jonah / Hexblade, Nazar / Fathomless, Abdul / Genie and captain von Stein / Undead`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `runtime_visibility: NOT_ACTIVE`
- `class_reference_visibility: ACTIVE_REFERENCE_ONLY`
- `subclasses: IN_PROGRESS_8_AUTHORED_OF_9_USER_PLANNED`
- `authored_subclasses: archfey, fiend, great-old-one, celestial, hexblade, fathomless, genie, undead`
- `queued_subclasses: undying`
- `duplicate_policy: the second supplied Fathomless/Nazar-Sverr block was not duplicated; wave 2 Nazar remains the canonical complete Fathomless literary draft`
- `source_policy: patron source labels copied from the user are planning hints only and must be independently verified during the mechanics pass`
- `mechanics_policy: exact reference rules are present; Pact Magic, Invocations, Pact options, patron spell access, Mystic Arcanum resources/actions and runtime package remain a separate future implementation before activation`

The authored Warlock reference is visible through `classReference`, but it must not be imported into Chasovlyak runtime templates or Character Class runtime UI until patron packages, resource/action contracts and package-quality tests are complete enough for activation.

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

Wizard is listed above because that reset is a historical event. Its old generic package remains retired; the clean 2024 base-class text package introduced on 2026-08-31 is a new source and does not revive the removed implementation.

### Historical custom test class

`Жопка` is intentionally **untouched** by this reset. It is a non-builtin historical test/easter-egg class (`is_builtin=false`, no catalog key). Its future visibility/hiding behavior is a separate task and must not be changed as part of legacy builtin cleanup.

---

## Legacy bootstrap garbage audit

**Dev status:** `GUARDED_PENDING_DEPLOYMENT`

Live production inspection on 2026-08-29 found obsolete `campaigns` triggers capable of reinstalling the historical full class/subclass catalog and reapplying superseded Voss layers to newly created campaigns. The dev-only forward migrations now:

- remove duplicate standalone official class/subclass installer triggers;
- retire the removed `Нюансы Восса` trigger;
- retire the rejected mechanics-paraphrase Voss explanation trigger;
- add an assignment-safe final prune that keeps rebuilt builtin Fighter/Druid/Cleric/Wizard;
- install the clean Wizard 2024 base-class text package after the historical seed and before the final prune;
- do not touch custom/non-builtin classes, including `Жопка`.

This guard is **not recorded as applied to production yet**. Do not claim the production bootstrap is clean until that deployment/database step is explicitly completed and re-audited.

---

## Future classes

Removed builtin classes without their own rebuilt section remain `NOT_STARTED` for the new architecture. New implementation must follow `CLASS_INTEGRATION_NOTES.md`, `GM_ADJUDICATION_BOUNDARY.md`, use stable source keys/types, reach CE end-to-end for CE-owned/hybrid state, and pass a package-specific quality/runtime audit before becoming visible as a finished class.
