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

## Bard (`class:bard`)

**Exact reference text:** `READY_CURRENT_AUTHORED_ROSTER_2026_09_11`  
**Mechanics/runtime:** `READY`

- `final_certification_migration: supabase/migrations/20260911175500_bard_runtime_final_certification_v1.sql`
- `final_runtime_revision: xphb-2024-bard-runtime-final-v1`
- `final_package_test: tests/bardRuntimeFinalCertification.test.ts`
- `pre_documentation_ci: GREEN_2026_09_11 / build + lint + full tests 990/990`
- `production_final: DEPLOYED_AND_AUDITED_2026_09_11`
- `production_final_migration: bard_runtime_final_certification_v1 / journal 20260911150941`
- `production_campaign_trigger: aaaaaaaal_campaigns_ensure_bard_runtime_final_v1`
- `production_final_privileges: certifier/installer anon=false; authenticated=false; service_role=true`
- `production_final_advisors: NO_BARD_OR_STAGE6_SPECIFIC_FINDINGS`
- `public_reference_runtime: ENABLED / base Bard referenceOnly=false through classReference runtime overlay`
- `runtime_subclass_count: 9`
- `runtime_subclasses: Dance, Glamour, Lore, Valor, Eloquence, Swords, Whispers, Creation, Spirits`
- `reference_only_subclasses: Tragedy`
- `production_broken_resource_refs: 0`
- `production_duplicate_mechanic_ids: 0`
- Stage 1 is the structural class foundation; Stage 2 is the canonical Bardic Inspiration runtime; Stage 3 is the Charisma/full-caster spell runtime; Stage 4 is the remaining base-class runtime; Stage 5 is the nine-college runtime package.
- Final certification is fail-closed. `READY` is written only after the migration validates the full prior stage stack, exact 1–20 level rows, starting grants/choices, Inspiration scaling/recovery, Font, Superior Inspiration, Expertise, Jack of All Trades, Countercharm, spell source gates, Words of Creation, all nine subclasses, resource identity, mechanic-ID uniqueness and shared RPC availability/privileges.
- Parent/source-level semantics are certified: a high total character level does not unlock Bard subclass features early. Production smoke used total level 12 with Bard level 3 and correctly resolved the subclass at source level 3; it then followed Bard level changes.
- Persistent-state smoke is certified: one spent Bardic Inspiration use survived resource re-sync; one spent 3rd-level spell slot survived Bard 10→11; the expected 6th-level slot appeared at Bard 11. All probes were rolled back.
- Class tab uses the resolved CE contract through `presentClassPackages()`; the final regression requires runtime resource/action entries and rejects Bard-specific presentation branches.
- Chat execution remains on shared GENA/template v2 RPCs. Choice UI uses shared Choice Runtime/rest RPCs; there is no Bard-only Chat or choice branch.
- Public reference now mirrors the certified runtime boundary: base Bard + nine approved colleges are runtime-backed; Tragedy remains reference-only.
- Supabase live parity after certification: `mechanics_status=READY`, `runtime_status=ready`, `runtime_stage=6`, nine child subclasses `runtime_status=ready`, Tragedy active builtin count 0, one final Bard campaign installer, broken resource refs 0, duplicate mechanic IDs 0.
- Generic cross-class capabilities intentionally remain outside Supported Bard Runtime V1 and are recorded explicitly in production metadata rather than faked by Bard-specific code:
  - `multiclass_entry_profile_runtime = generic_pending`;
  - `multiclass_spell_slot_aggregation_runtime = generic_pending`;
  - `feat_source_runtime = generic_pending`.
- What is certified for multiclass use today is Bard parent/source-level semantics. Starting-vs-multiclass entry grants, combined caster slot aggregation and the generic feat/ASI subsystem must be solved once for all affected classes.

**Bard is mechanically READY in the currently supported application runtime.** Do not reopen Bard with class-specific UI/runtime branches to solve the generic cross-class debts above.

---

## Paladin reference-layer legacy note

The former shared Bard/Paladin reference note was split when Bard runtime work started. Paladin runtime readiness is governed by the Paladin migrations and certification regressions; do not infer Paladin status from the Bard section.

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
**Mechanics/runtime:** `READY`

- `authoring_started: 2026-09-03`
- `authoring_source: src/data/classes/sorcererReferenceDraft.ts`
- `subclass_authoring_sources: src/data/classes/sorcererSubclassReferenceDraft.ts; src/data/classes/sorcererSubclassReferenceDraftWave2.ts; src/data/classes/sorcererSubclassReferenceDraftWave3.ts; src/data/classes/sorcererSubclassReferenceDraftWave4.ts`
- `authoring_plan: src/data/classes/sorcererAuthoringPlan.md`
- `current_dev_text: Luka base narration plus the nine supported Sorcerer runtime identities are authored; Runechild / Kazimir, Phoenix / Marfa and Stone / Gordey remain extended reference-only candidates outside the certified runtime scope`
- `exact_reference_rules: READY_CURRENT_AUTHORED_ROSTER_2026_09_04`
- `last_mechanics_audit_started: 2026-09-09`
- `last_dev_runtime_audit: 2026-09-10`
- `last_deployed_runtime_audit: 2026-09-10`
- `runtime_certification: sorcerer-runtime-final-v1@2026-09-10`
- `stage_1_foundation: READY_2026_09_08_PR_60`
- `stage_1_runtime_revision: xphb-2024-sorcerer-stage1-foundation-v2`
- `stage_2_resource_runtime: READY_2026_09_08`
- `stage_2_runtime_revision: xphb-2024-sorcerer-stage2-resource-v1`
- `stage_2_migration: supabase/migrations/20260908192000_sorcerer_stage2_resource_runtime_v1.sql`
- `stage_2_regressions: tests/sorcererResourceRuntimeStage2.test.ts; tests/sorcererStage2MigrationShape.test.ts`
- `stage_3_font_of_magic_runtime: READY_2026_09_08_PR_62`
- `stage_3_runtime_revision: xphb-2024-sorcerer-stage3-font-of-magic-v1`
- `stage_3_reverse_conversion_correction: READY_2026_09_09`
- `stage_3_reverse_conversion_migration: supabase/migrations/20260908230000_sorcerer_stage3_reverse_conversion_fix_v1.sql`
- `stage_4_metamagic_runtime: READY_2026_09_09_PR_63`
- `stage_4_runtime_revision: xphb-2024-sorcerer-stage4-metamagic-v1`
- `stage_4_migrations: supabase/migrations/20260908231500_sorcerer_stage4_spell_modifier_runtime_v1.sql; supabase/migrations/20260908232000_sorcerer_stage4_metamagic_runtime_v1.sql`
- `stage_4_regression: tests/sorcererMetamagicStage4.test.ts`
- `stage_5_base_runtime: READY_2026_09_09_PR_64`
- `stage_5_runtime_revision: xphb-2024-sorcerer-stage5-base-runtime-v1`
- `stage_5_migrations: supabase/migrations/20260909000000_sorcerer_stage5_stage4_compat_v1.sql; supabase/migrations/20260909010000_sorcerer_stage5_base_runtime_v1.sql; supabase/migrations/20260909011000_sorcerer_stage5_trigger_cleanup_v1.sql`
- `stage_5_regression: tests/sorcererBaseRuntimeStage5.test.ts`
- `stage_6_spell_runtime: READY_2026_09_09`
- `stage_6_runtime_revision: xphb-2024-sorcerer-stage6-spell-runtime-v1`
- `stage_6_migration: supabase/migrations/20260909090000_sorcerer_stage6_spell_runtime_v1.sql`
- `stage_6_regression: tests/sorcererSpellRuntimeStage6.test.ts`
- `stage_7_subclass_runtime: READY_2026_09_10`
- `stage_7_runtime_revision: xphb-2024-sorcerer-stage7-subclass-runtime-v1`
- `stage_7_migration: supabase/migrations/20260910200000_sorcerer_stage7_subclass_runtime_v1.sql`
- `stage_7_choice_action_migration: supabase/migrations/20260910203000_sorcerer_stage7_template_choice_action_v1.sql`
- `stage_7_lunar_dedup_correction: supabase/migrations/20260910204000_sorcerer_stage7_lunar_choice_dedup_fix_v1.sql`
- `stage_7_bastion_text_precision: supabase/migrations/20260910205000_sorcerer_stage7_bastion_text_precision_v1.sql`
- `stage_7_regression: tests/sorcererSubclassesStage7.test.ts`
- `stage_8_final_certification: READY_2026_09_10`
- `stage_8_runtime_revision: xphb-2024-sorcerer-runtime-final-v1`
- `stage_8_migration: supabase/migrations/20260910210000_sorcerer_runtime_final_certification_v1.sql`
- `stage_8_regression: tests/sorcererRuntimeFinalCertification.test.ts`
- `stage_8_restoration_correction: floor(Sorcerer level / 2) is now emitted at every Sorcerer level 5-20, including even levels`
- `stage_8_reference_activation: BASE_PLUS_9_RUNTIME_VISIBLE; RUNECHILD_PHOENIX_STONE_REFERENCE_ONLY`
- `stage_8_multiclass_certification: SUBCLASS_AND_SOURCE_LEVEL_USE_PARENT_SORCERER_LEVEL_NOT_TOTAL_CHARACTER_LEVEL`
- `runtime_visibility: FINAL_BASE_AND_9_SUBCLASSES_ACTIVE_DEV_AND_PRODUCTION_2026_09_10`
- `class_reference_visibility: RUNTIME_BACKED_BASE_PLUS_9; EXTENDED_3_REFERENCE_ONLY`
- `canonical_resources: innate_sorcery=2/LR; sorcery_points=max Sorcerer level/LR; sorcerous_restoration=1/LR`
- `sorcerous_restoration_amount: floor(Sorcerer level / 2), after Short Rest, from Sorcerer level 5`
- `assignment_resource_sync: ACTIVE; persistent current lives in character_resource_states and level changes preserve spent deficit`
- `production_runtime: STAGE8_FINAL_RUNTIME_DEPLOYED_AND_CERTIFIED_2026_09_10`
- `production_subclass_count: 9`
- `production_subclass_parent_contract: ALL_9_PARENTED_TO_CLASS_SORCERER_AND_UNLOCK_AT_LEVEL_3`
- `font_of_magic_conversion_runtime: READY_STAGE3_PLUS_2024_REVERSE_CONVERSION_CORRECTION`
- `metamagic_runtime: READY_STAGE4_10_OPTIONS_CHOICE_2_4_6_ATOMIC_GENA_CAST`
- `metamagic_cast_rpc: send_chat_spell_with_template_modifiers_v2`
- `innate_sorcery_activation_runtime: READY_STAGE5_SERVER_60_SECONDS`
- `sorcery_incarnate_runtime: READY_STAGE5_LEVEL7_FALLBACK_2_SP_AND_TWO_METAMAGIC_WHILE_ACTIVE`
- `arcane_apotheosis_runtime: READY_STAGE5_LEVEL20_ONE_FREE_METAMAGIC_WHILE_ACTIVE_GM_TURN_BOUNDARY`
- `spell_runtime: READY_STAGE6`
- `spell_runtime_visibility: ACTIVE_DEV_AND_PRODUCTION_2026_09_09`
- `spell_catalog_links: DYNAMIC_SORCERER_CLASS_CATALOG`
- `spell_choice_runtime: PERSISTENT_ON_LEVEL_CHANGE_2024`
- `subclass_runtime: READY_STAGE7_9`
- `subclass_runtime_count: 9`
- `subclasses: COMPLETE_9_RUNTIME_PLUS_3_EXTENDED_REFERENCE_ONLY`
- `runtime_subclasses: aberrant-sorcery, clockwork-sorcery, draconic-sorcery, wild-magic-sorcery, divine-soul, shadow-magic, storm-sorcery, lunar-sorcery, pyromancer`
- `subclass_runtime_reference_only: runechild, phoenix-sorcery, stone-sorcery`
- `divine_soul_spell_runtime: SORCERER_PLUS_CLERIC_SOURCE_GATED_WITH_SHARED_PREPARED_QUOTA`
- `aberrant_psionic_runtime: CLASS_FEATURE_SPELL_METHODS_SP_EQUAL_SPELL_LEVEL`
- `shadow_darkness_runtime: CLASS_FEATURE_SPELL_METHOD_2_SP`
- `draconic_resilience_runtime: COMBAT_MAX_HP_PLUS_3_AT_L3_PLUS_1_EACH_L4_TO_L20`
- `clockwork_restore_balance_runtime: MAX_1_OR_CHARISMA_MODIFIER_PER_LONG_REST`
- `lunar_phase_mutation_runtime: ATOMIC_TEMPLATE_CHOICE_ACTION_1_SP_WITH_CHOICE_RUNTIME_V2_PERSISTENCE`
- `lunar_level6_shape: EXACTLY_ONE_BOONS_FEATURE_ONE_BOONS_RESOURCE_ONE_WAXING_FEATURE_ONE_WAXING_ACTION`
- `source_policy: source/publication labels in literary copy are non-authoritative; Runechild, Phoenix Sorcery and Stone Sorcery remain explicitly outside the certified Stage 7 runtime scope until separately approved`
- `mechanics_policy: Stages 1–8 are certified in the shared template/CE/Shapoklyak/GENA pipeline. Base resources, Font of Magic, Metamagic, Innate Sorcery, full Sorcerer spell selection/casting and all nine supported subclass packages use canonical shared resources and source identities. Divine Soul extends the generic spell choice through source requirements; Lunar phase changes are an authoritative generic template-choice action in the same receipt-aware transaction as the 1 SP cost. Sorcerous Restoration is certified at floor(Sorcerer level / 2) for every level 5-20. Per-turn cadence and scene legality remain GM-adjudicated because the application has no authoritative turn tracker.`

### Certified mechanics scope

- Base Sorcerer Stages 1–6 remain active: full-caster slots, Charisma spellcasting, persistent spell choices, canonical Sorcery Points, Font of Magic, Metamagic and Innate Sorcery all share the existing CE/GENA runtime.
- Nine supported subclass identities are active in production and inherit Sorcerer class level through their parent assignment. All unlock at Sorcerer level 3 under the project's 2024 compatibility policy.
- Aberrant Psionic Sorcery exposes real class-feature casting methods whose Sorcery Point cost equals spell level.
- Clockwork Restore Balance uses the Charisma modifier with a minimum of 1 and a Long Rest recharge.
- Draconic Resilience contributes directly to `combat.maxHp`: +3 on subclass entry and +1 for each later Sorcerer level.
- Wild Magic follows the 2024 player-driven surge/Tides contract instead of the obsolete GM-triggered base surge.
- Divine Soul extends the existing Sorcerer cantrip/prepared-spell choices with Cleric options behind `source_requirements_any`; ordinary Sorcerers cannot select those options and the normal Sorcerer prepared quota/replacement rules remain unchanged.
- Shadow Magic exposes Darkness as a real 2-SP class-feature spell access.
- Lunar Sorcery exposes Sacred Flame and active-phase free spell access; changing phase costs 1 Sorcery Point and atomically persists the new `sorcerer_lunar_phase` through Choice Runtime v2. The level-6 package is deduplicated and contains exactly one feature/action identity for Waxing and Waning.
- Storm Sorcery and Pyromancer durable resistances/immunities resolve as native grants; their scene-triggered consequences remain exact GM-adjudicated rules instead of fake combat state.
- Runechild, Phoenix Sorcery and Stone Sorcery remain reference-only extended candidates and are not part of the certified runtime count.

Sorcerer Stages 1–8 and the nine declared runtime subclasses are implemented, player-reference activated, regression-gated and production-certified in the connected Supabase project. No known Sorcerer implementation or deployment blocker remains inside the declared final runtime scope.

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

## Rogue (`class:rogue`)

**Text:** `READY`  
**Mechanics/runtime:** `NOT_STARTED`

- `authoring_started: 2026-09-10`
- `base_authoring_source: src/data/classes/rogueReferenceCurrent.ts`
- `subclass_authoring_sources: src/data/classes/rogueSubclassReferenceWave1.ts; src/data/classes/rogueSubclassReferenceWave2.ts; src/data/classes/rogueSubclassReferenceWave3.ts`
- `runtime_plan: src/data/classes/rogueRuntimePlan.md`
- `runtime_plan_status: STAGE_1_COMPLETE_STAGE_2_NEXT; STAGES_2_TO_7_REQUIRED_FOR_READY`
- `stage_1_source_freeze_and_text_closure: COMPLETE_2026_09_12`
- `stage_1_feature_matrix: src/data/classes/rogueRuntimeFeatureMatrix.md`
- `stage_1_feature_count: 61_TOTAL = 15_BASE + 46_SUBCLASS`
- `stage_1_source_audit: VERIFIED_BASE_2024_PLUS_9_FROZEN_SUBCLASS_PACKS_2026_09_12`
- `stage_2_foundation_1_20: NOT_STARTED`
- `stage_3_core_rogue_runtime: NOT_STARTED`
- `stage_4_base_runtime_certification: NOT_STARTED`
- `stage_5_phb2024_subclasses: NOT_STARTED`
- `stage_6_legacy_supplement_subclasses: NOT_STARTED`
- `stage_7_final_production_certification: NOT_STARTED`
- `current_dev_text: base Rogue plus all nine supported subclass feature packs have complete authored Voss prose and exact neutral rule text; Steady Aim and Slippery Mind literary gaps are closed`
- `exact_reference_rules: BASE_2024_READY_PLUS_9_SUBCLASS_PACKS_READY_2026_09_12`
- `subclass_reference_roster: thief, assassin, arcane-trickster, soulknife, swashbuckler, inquisitive, mastermind, scout, phantom`
- `wave3_reference_scope: Mastermind and Scout use legacy Xanathar rules; Phantom uses the published Tasha’s Cauldron of Everything rules`
- `reference_visibility: BASE_AND_ALL_9_SUBCLASSES_REFERENCE_ONLY`
- `dev_runtime: ABSENT`
- `production_runtime: ABSENT`
- `production_template_audit: no active class:rogue or Rogue subclass rule_templates found in the connected Supabase project as of 2026-09-12`
- `runtime_boundary: reference mechanics are documentation only; no CE contribution, persistent resource, choice runtime, spell runtime or executable class action is claimed by this authoring pass`
- `wave3_regression: tests/rogueSubclassReferenceWave3.test.ts`

Known source-copy corrections locked by Wave 3 regression:
- Master of Intrigue does not invent an Insight-vs-Deception contest for detecting the imitated accent.
- Soul of Deceit makes truth-detection report truthfulness at the Rogue's choice rather than automatically for every statement.
- Scout Sudden Strike permits the Bonus Action attack against any legal target; only a second Sneak Attack in the same turn must be against a different target.
- Phantom Wails from the Grave rolls half the Rogue's Sneak Attack dice (rounded up) for the secondary Necrotic damage.
- Tasha's Tokens of the Departed has no extra Undead/Construct exclusion, and the queried spirit is not required to tell the truth.
- Tasha's Death's Friend grants its fallback Soul Trinket at the end of a Long Rest when none are held; it does not use Initiative as that trigger.

Rogue text/reference Stage 1 is closed. Mechanics/runtime remains `NOT_STARTED` until Stage 2 creates the clean `class:rogue` package. The canonical next step is Stage 2 in `src/data/classes/rogueRuntimePlan.md`; overall mechanics `READY` remains forbidden before Stage 7 production certification.

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