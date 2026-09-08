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
**Mechanics/runtime:** `READY`

- `last_text_audit: 2026-09-03`
- `voss_class_subclass_feature_voice_pass: GRIMDARK_REARLINE_COWARD_PREJUDICE_WITH_DOMAIN_EXCEPTIONS_2026_09_02`
- `current_dev_text: canonical Voss narration rewritten for the base Cleric, all fourteen supported domains and every active domain feature; class-wide distrust centers on rear-line cowardice while individual domains earn distinct contempt or grudging respect; exact rules unchanged`
- `translation_wiring_audit: DEV_AND_MAIN_ACTIVE_AGGREGATOR_IDENTICAL_2026_09_03`
- `last_mechanics_audit_started: 2026-08-29`
- `last_dev_runtime_audit: 2026-09-06`
- `last_deployed_runtime_audit: 2026-09-06`
- `runtime_certification: cleric-runtime-certified@2026-09-06`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: base Cleric and all fourteen domains are certified through the shared template/parser/Character Engine/action/spell/resource pipeline; Divine Order, Channel Divinity, Divine Spark, spell preparation, Blessed Strikes, Divine Intervention and domain finite pools use canonical CE identities`
- `production_runtime: DEPLOYED_AND_CERTIFIED_2026_09_06`
- `production_domain_count: 14`
- `production_domain_unlock_contract: ALL_14_AT_CLERIC_LEVEL_3`
- `production_resource_identity_audit: ZERO_BROKEN_RESOURCE_REFS`
- `production_spell_package_audit: ALL_14_DOMAIN_PACKAGES_ALWAYS_PREPARED_CLASS_SPELL_WISDOM`
- `production_channel_divinity_contract: SHARED_CANONICAL_RESOURCE_2_AT_L2_3_AT_L6_4_AT_L18_SHORT_REST_PLUS_1_LONG_REST_FULL`
- `production_greater_divine_intervention: exact Wish branch preserved; 2d4 Long Rest cooldown is GM-adjudicated because the current authoritative runtime does not own the nested spell choice or rolled 2d4 result`
- `certification_regression: tests/clericRuntimeFinalCertification.test.ts`

### Certified mechanics scope

- Base spellcasting uses the full-caster slot ledger, the 1–20 prepared-spell progression, Wisdom, and authoritative Long Rest preparation refresh.
- Divine Order and Blessed Strikes are persistent level-gated choices; only selected branches emit mechanics.
- Channel Divinity is one shared CE resource with canonical level progression and recovery; Divine Spark and every domain spender consume that shared identity.
- Divine Spark carries structured `1d8 / 2d8 / 3d8 / 4d8` Cleric-level scaling rather than a stale static action payload.
- All fourteen domains — Arcana, Death, Forge, Grave, Knowledge, Life, Light, Nature, Order, Peace, Tempest, Trickery, Twilight and War — are production-audited. Historical feature rows below level 3 remain safely blocked by the parent subclass unlock.
- Every finite action/resource effect/persistent counter audited in the supported Cleric package resolves to an actual CE ledger; production has zero broken resource references and no duplicate action identity in the certified package.
- Domain spell groups are always prepared, use canonical `class_spell` access with Wisdom and share ordinary Cleric spell slots.
- Greater Divine Intervention keeps the exact `Wish → 2d4 Long Rests` rule. That exceptional randomized cooldown is explicitly GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`; the ordinary Divine Intervention finite resource remains CE-owned.
- Action/Bonus Action/Reaction availability, scene-trigger validity and other non-authoritative play facts remain GM-adjudicated by design rather than backed by fake turn/scene counters.

Base Cleric and all fourteen supported domains are implemented, regression-gated and production-certified in the declared scope. There are no known Cleric implementation or deployment blockers in that scope.

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

- Spellbook as authoritative owned-spell state: physical item identity, held-book access, six level-1 spells at Wizard level 1 and two additional eligible Wizard spells per later Wizard level are implemented and regression-gated. Class-authored starting equipment is intentionally empty; the GM supplies all gear.
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
**Mechanics/runtime:** `READY`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/monkReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/monkSubclassReferenceDraft.ts; src/data/classes/monkSubclassReferenceDraftWave2.ts; src/data/classes/monkSubclassReferenceDraftWave3.ts; src/data/classes/monkSubclassReferenceDraftWave4.ts`
- `authoring_closure: src/data/classes/monkAuthoringClosure.md`
- `current_dev_text: Brother Korn base narration plus all ten declared WotC-scope literary identities are authored; Cobalt Soul / Sister Valeria and Living Weapon / Brother Goran are retained as the two additional third-party/partnered runtime packages`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `last_mechanics_audit_started: 2026-09-04`
- `last_dev_runtime_audit: 2026-09-04`
- `last_deployed_runtime_audit: 2026-09-04`
- `dev_base_class_runtime: READY`
- `dev_subclass_runtime: READY_12_TOTAL_10_WOTC_PLUS_2_ADDITIONAL`
- `dev_subclass_runtime_revision: monk-subclasses-batch3-runtime-v1`
- `runtime_closure_revision: monk-runtime-finalization-v1`
- `subclass_supported_count: 12`
- `wotc_subclass_supported_count: 10`
- `additional_subclass_supported_count: 2`
- `subclass_batch1: mercy, shadow, elements, open-hand`
- `subclass_batch2: drunken-master, kensei, ascendant-dragon, astral-self`
- `subclass_batch3: sun-soul, long-death, cobalt-soul, living-weapon`
- `subclass_feature_levels: 3,6,11,17 where defined by the source package`
- `shared_resource: monk_focus`
- `base_runtime_regressions: tests/monkOfficialPack.test.ts; tests/monkRuntimeCompletion.test.ts`
- `subclass_regressions: tests/monkSubclassBatch1.test.ts; tests/monkSubclassBatch2.test.ts; tests/monkSubclassBatch3.test.ts`
- `catalog_bootstrap: READY; 20260904122000_monk_catalog_bootstrap.sql creates class:monk before runtime for existing and new campaigns`
- `resource_integer_compat: READY; literal subclass resource maxima are accepted without weakening formula-json maxima`
- `value_reference_precision: READY; canonical dependency is values.martial_arts_die_sides and deployed legacy bad-reference count is zero`
- `runtime_visibility: DEV_AND_PRODUCTION_ACTIVE_AND_AUDITED_2026_09_04`
- `class_reference_visibility: ACTIVE; Korn narration and exact reference rules remain the presentation source while runtime templates carry CE mechanics separately`
- `subclasses: READY_10_OF_10_WOTC_PLUS_2_ADDITIONAL_RUNTIME`
- `wotc_runtime_scope: open-hand, shadow, drunken-master, elements, mercy, kensei, ascendant-dragon, astral-self, sun-soul, long-death`
- `additional_runtime_scope: cobalt-soul, living-weapon`
- `source_classification: cobalt-soul=third_party_partnered; living-weapon=third_party`
- `mechanics_policy: CE owns persistent Focus and finite rest-recovering uses; scene/target/light/turn legality remains GM-adjudicated when the app lacks authoritative state; subclass packages reuse the base monk_focus pool rather than duplicating it`
- `production_runtime: DEPLOYED_AND_CERTIFIED_2026_09_04`
- `production_subclass_count: 12`
- `production_wotc_subclass_count: 10`
- `production_additional_subclass_count: 2`
- `production_runtime_metadata: mechanics_status=READY; subclass_mechanics_status=READY; subclass_runtime_included=true`
- `production_bad_legacy_value_refs: 0`

Base Monk and all declared Monk runtime packages are implemented, regression-gated and deployed. The current supported roster is complete at ten WotC subclasses plus Cobalt Soul and Living Weapon as two explicitly non-WotC additions. Scene and turn facts outside authoritative app state remain on the documented GM adjudication boundary and are not runtime blockers.

---

## Sorcerer (`class:sorcerer`)

**Text:** `READY_AUTHORING_SCOPE`  
**Mechanics/runtime:** `IN_PROGRESS`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/sorcererReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/sorcererSubclassReferenceDraft.ts; src/data/classes/sorcererSubclassReferenceDraftWave2.ts; src/data/classes/sorcererSubclassReferenceDraftWave3.ts; src/data/classes/sorcererSubclassReferenceDraftWave4.ts`
- `authoring_plan: src/data/classes/sorcererAuthoringPlan.md`
- `current_dev_text: Luka base narration plus the nine originally planned Sorcerer identities are authored; Runechild / Kazimir, Phoenix / Marfa and Stone / Gordey are additionally preserved as extended candidates`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `last_mechanics_audit_started: 2026-09-08`
- `stage_1_foundation: READY_2026_09_08_PR_60`
- `stage_1_runtime_revision: xphb-2024-sorcerer-stage1-foundation-v2`
- `stage_2_resource_runtime: READY_2026_09_08`
- `stage_2_runtime_revision: xphb-2024-sorcerer-stage2-resource-v1`
- `stage_2_migration: supabase/migrations/20260908192000_sorcerer_stage2_resource_runtime_v1.sql`
- `stage_2_regressions: tests/sorcererResourceRuntimeStage2.test.ts; tests/sorcererStage2MigrationShape.test.ts`
- `runtime_visibility: BASE_STAGE2_RESOURCE_ACTIVE_DEV_AND_PRODUCTION_2026_09_08`
- `class_reference_visibility: ACTIVE_REFERENCE_ONLY_UNTIL_LATER_RUNTIME_STAGES_CLOSE`
- `canonical_resources: innate_sorcery=2/LR; sorcery_points=max Sorcerer level/LR; sorcerous_restoration=1/LR`
- `sorcerous_restoration_amount: floor(Sorcerer level / 2), after Short Rest, from Sorcerer level 5`
- `assignment_resource_sync: ACTIVE; persistent current lives in character_resource_states and level changes preserve spent deficit`
- `production_runtime: STAGE2_RESOURCE_DEPLOYED_2026_09_08`
- `font_of_magic_conversion_runtime: PENDING_STAGE3`
- `metamagic_runtime: PENDING_STAGE4`
- `spell_runtime: PENDING`
- `subclass_runtime: PENDING`
- `subclasses: COMPLETE_9_PLANNED_PLUS_3_EXTENDED_AUTHORED`
- `planned_authored: aberrant-sorcery, clockwork-sorcery, draconic-sorcery, wild-magic, divine-soul, shadow-magic, storm-sorcery, lunar-sorcery, pyromancer`
- `extended_candidates: runechild, phoenix-sorcery, stone-sorcery`
- `source_policy: source/publication labels in literary copy are non-authoritative; Plane Shift, partner/community and UA eligibility must be independently verified before runtime inclusion`
- `mechanics_policy: Stage 1 structural foundation and Stage 2 persistent resource accounting are active; full class mechanics remain IN_PROGRESS until Font of Magic conversion, Metamagic execution, spell runtime and the later declared stages are implemented and verified`

Sorcerer Stage 1 foundation and Stage 2 persistent resource accounting are installed in the shared template/CE/Shapoklyak resource pipeline and deployed to the connected Supabase target. The player reference remains explicitly reference-only for the unfinished class package; Stage 2 does not claim Font of Magic slot conversion, Metamagic execution, spell runtime or subclass runtime.

---

## Warlock (`class:warlock`)

**Text:** `READY`  
**Mechanics/runtime:** `READY`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/warlockReferenceCurrent.ts`
- `subclass_authoring_sources: src/data/classes/warlockSubclassReferenceCurrent.ts; src/data/classes/warlockSubclassReferenceCurrentWave2.ts; src/data/classes/warlockSubclassReferenceCurrentWave3.ts; src/data/classes/warlockSubclassReferenceDraftWave4.ts`
- `authoring_plan: src/data/classes/warlockAuthoringPlan.md`
- `final_certification: src/rule-templates/WARLOCK_READY_CERTIFICATION.md`
- `stage_1_source_of_truth_sync: READY_2026_09_07`
- `stage_2_supplemental_patron_runtime: READY_5_OF_5_2026_09_07`
- `stage_3_end_to_end_1_20: READY_2026_09_07`
- `stage_4_final_source_gate_and_production_certification: READY_2026_09_07`
- `current_dev_text: base Warlock and all nine supported runtime patrons are visible through one runtime-aware class reference; Raven Queen, Seeker and Great Wyrm remain explicitly literary/reference-only`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_07`
- `last_mechanics_audit_started: 2026-09-06`
- `last_dev_runtime_audit: 2026-09-07`
- `last_deployed_runtime_audit: 2026-09-07`
- `dev_base_class_runtime: READY`
- `dev_invocation_runtime: READY_28_OF_28`
- `dev_phb2024_patron_runtime: READY_4_OF_4`
- `dev_supplemental_patron_runtime: READY_5_OF_5`
- `runtime_supported_patron_count: 9`
- `base_runtime_revision: xphb-2024-warlock-base-runtime-v1`
- `invocation_runtime_revision: xphb-2024-warlock-invocations-runtime-v1`
- `stage_4_runtime_revision: xphb-2024-warlock-ui-qa-v1`
- `phb_patron_runtime_revision: xphb-2024-warlock-subclasses-runtime-v1`
- `supplemental_patron_runtime_revision: warlock-supplemental-runtime-v1`
- `source_gate_revision: warlock-ready-stage4-source-gated-spells-v1`
- `base_runtime_regression: tests/warlockOfficialPack.test.ts`
- `invocation_runtime_regression: tests/warlockInvocationsRuntime.test.ts`
- `phb_patron_regressions: tests/warlockPhb2024SubclassesRuntime.test.ts; tests/warlockStage5ProductionReconciliation.test.ts`
- `supplemental_patron_regression: tests/warlockSupplementalSubclassesRuntime.test.ts`
- `ready_plan_e2e_regression: tests/warlockReadyPlanStage3E2e.test.ts`
- `source_gate_regression: tests/warlockReadyStage4SupplementalSpellAccess.test.ts`
- `reference_boundary_regression: tests/newClassReferenceMechanics.test.ts`
- `final_code_gate: GitHub Actions CI #1863 run 34132411173 passed build, lint and complete test suite on 2026-09-07`
- `runtime_visibility: BASE_INVOCATIONS_AND_ALL_9_SUPPORTED_PATRONS_DEV_AND_PRODUCTION_ACTIVE_AND_AUDITED_2026_09_07`
- `class_reference_visibility: BASE_RUNTIME_BACKED; PHB2024_4_RUNTIME_BACKED; SUPPLEMENTAL_5_RUNTIME_BACKED; EXPANDED_3_REFERENCE_ONLY`
- `choice_ui_runtime: GENERIC_CHOICE_RUNTIME_V2_READY_NO_WARLOCK_ONLY_CLIENT_BRANCH`
- `current_dev_runtime: complete supported Warlock runtime includes 1-20 Pact Magic/base progression, all 28 Eldritch Invocations, Mystic Arcanum 6-9, four PHB 2024 patrons, five supplemental patrons and source-gated supplemental expanded spell choices through the shared template/parser/Character Engine/persistence pipeline`
- `pact_magic_resource: warlock_pact_slots`
- `pact_magic_slot_count_progression: L1=1; L2-10=2; L11-16=3; L17-20=4`
- `pact_magic_slot_level_progression: L1-2=1; L3-4=2; L5-6=3; L7-8=4; L9-20=5`
- `pact_magic_recovery: FULL_ON_SHORT_REST_AND_LONG_REST`
- `pact_magic_cast_rpc: public.cast_warlock_pact_spell_v1; auth.uid and can_operate_character_resources enforced before mutation`
- `magical_cunning_runtime: CE resource-backed action; ceil(max Pact Slots / 2) restored after 1-minute rite; one use per Long Rest`
- `eldritch_master_runtime: Magical Cunning restore value becomes all Pact Slots at Warlock level 20`
- `contact_patron_runtime: level 9 resource-backed Contact Other Plane semantic action with independent Long Rest use and automatic Intelligence-save success metadata`
- `mystic_arcanum_runtime: independent level 6/7/8/9 Long Rest resources at Warlock levels 11/13/15/17 plus persistent player_once spell choices using Choice Runtime v2`
- `invocation_choice_key: warlock_eldritch_invocations`
- `invocation_count_progression: L1=1; L2=3; L5=5; L7=6; L9=7; L12=8; L15=9; L18=10`
- `invocation_replacement_policy: ON_LEVEL_CHANGE_MAX_1_PREVIOUS_INVOCATION`
- `repeatable_invocations: agonizing-blast, eldritch-spear, lessons-of-the-first-ones, repelling-blast; selector-bound instances remain mechanically distinct in CE`
- `invocation_prerequisite_runtime: Choice Runtime v2 validates required invocations and minimum levels server-side; stale dependent selections remain persisted but become inert until prerequisites are valid again`
- `pact_tome_runtime: three cantrips plus two level-1 ritual spells selected from canonical spell_catalog; dependent choices require pact-of-the-tome and refresh after authoritative Short or Long Rest`
- `supplemental_spell_source_runtime: option_rules.source_requirements_any plus database trigger plus server RPC revalidation; stale patron spell selections become inert when their source disappears`
- `production_runtime: BASE_INVOCATIONS_PHB2024_4_AND_SUPPLEMENTAL_5_DEPLOYED_AND_CERTIFIED_2026_09_07`
- `production_base_catalog_revision: xphb-2024-warlock-ui-qa-v1`
- `production_base_level_rows: 20`
- `production_invocation_catalog: 28_TOTAL_28_RUNTIME_READY`
- `production_supported_patron_count: 9`
- `production_phb2024_patron_count: 4`
- `production_supplemental_patron_count: 5`
- `production_patron_unlock_contract: ALL_9_AT_WARLOCK_LEVEL_3`
- `production_phb2024_patrons: archfey, celestial, fiend, great-old-one`
- `production_supplemental_patrons: hexblade, fathomless, genie, undead, undying`
- `production_source_gate_audit: SHIELD_REQUIRES_HEXBLADE; SANCTUARY_REQUIRES_GENIE_PLUS_DAO; VALIDATION_TRIGGER_INSTALLED`
- `production_duplicate_active_catalog_keys: 0`
- `production_orphan_subclasses: 0`
- `production_required_legacy_spell_seeds: 6_OF_6_PRESENT`
- `supabase_advisor_note: post-deployment security/performance advisors report pre-existing project-wide RLS/SECURITY_DEFINER/index debt; no Warlock-specific finding invalidates the certified runtime; Warlock gameplay RPC authorization remains enforced internally`
- `runtime_ready_subclasses: archfey, celestial, fiend, great-old-one, hexblade, fathomless, genie, undead, undying`
- `expanded_literary_only_subclasses: raven-queen, seeker, great-wyrm`
- `source_policy: expanded/UA literary identities are not promoted into the supported runtime roster without an explicit source/scope decision`
- `mechanics_policy: all four readiness stages are closed; CE owns persistent resources/choices/access, while scene/target/hit/reaction/turn/randomized facts outside authoritative app state remain GM-adjudicated rather than represented by fake counters`

Base Warlock, all 28 supported Eldritch Invocations and all nine supported runtime patrons are implemented, regression-gated and deployed. GitHub, the player-facing runtime roster and production Supabase agree on the supported boundary. There are no known Warlock-specific implementation, persistence, source-eligibility or deployment blockers in that scope. Raven Queen, Seeker and Great Wyrm remain explicit literary/reference-only material and do not block `READY`.

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