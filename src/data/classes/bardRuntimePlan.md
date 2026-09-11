# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 6: FINAL RUNTIME CERTIFIED / READY.**

The supported Bard runtime is complete and deployed to production. The public class reference is runtime-backed, the nine approved colleges are runtime-backed, and the final production certification is fail-closed.

Production revision: `xphb-2024-bard-runtime-final-v1`.

Final certification proves:

- exactly one active builtin `class:bard` with level rows 1–20;
- complete Stage 1–5 runtime stack is present before `READY` can be written;
- Bardic Inspiration uses the canonical `bardic_inspiration` ledger, exact d6/d8/d10/d12 scaling, correct Long Rest → Short/Long Rest recovery transition, Font slot conversion and Superior Inspiration minimum-2 semantics;
- Expertise uses the shared `skill_proficiencies` provider; Jack of All Trades is the exact untrained-skill half-PB rule and never touches initiative;
- Bard spell choices use Charisma, the shared slot ledger, exact cantrip/prepared progression and the Bard/Cleric/Druid/Wizard Magical Secrets source gate;
- Words of Creation keeps Power Word Heal and Power Word Kill always prepared and preserves the structured 10-foot second-target rule;
- all nine runtime colleges are children of the active Bard, unlock at Bard 3 and resolve from parent Bard level;
- Tragedy remains reference-only with zero active builtin runtime templates;
- no broken Bard/subclass resource references or duplicate mechanic IDs exist;
- Class tab presentation is generated from the resolved CE contract;
- Chat uses shared GENA template action/spell routes and choices use shared Choice Runtime/rest RPCs;
- final installer/certifier functions are closed to `anon` and `authenticated` and executable by `service_role`;
- pre-deploy dry-run, pre-deploy smoke, post-deploy smoke, live parity audit and full CI all passed.

Production migration: `bard_runtime_final_certification_v1` (journal `20260911150941`).

Pre-documentation Stage 6 CI passed build, lint and `990/990` tests. The production smoke used a total-level-12 character with a lower Bard source level to prove subclass progression follows Bard level, preserved one spent Bardic Inspiration use through re-sync, preserved a spent 3rd-level slot through Bard 10→11, and created the expected 6th-level slot at Bard 11. Every probe ran inside a rolled-back transaction.

Supabase security/performance advisors report no Bard/Stage6-specific findings. Existing project-wide advisor debt remains outside this class certification.

## Stage 2 — Bardic Inspiration — COMPLETE

Implemented and deployed on 2026-09-11.

- state key: `bardic_inspiration`;
- maximum: Charisma modifier, minimum 1;
- die: d6 at Bard 1, d8 at 5, d10 at 10, d12 at 15;
- recovery: Long Rest at levels 1–4; Short or Long Rest from level 5;
- spending goes through the shared GENA/template-action path;
- Font of Inspiration spends one canonical shared spell slot and restores one expended use;
- Superior Inspiration never reduces an existing pool of two or more uses and still reaches two when the ordinary Charisma-based maximum is only one. It uses generic `ENSURE_MINIMUM` plus temporary capacity that survives reload and is removed on Long Rest;
- assignment/level/Charisma synchronization preserves spent deficit and removal cleans orphaned state;
- no Bard-only resource table exists;
- Stage 2 closure migration: `supabase/migrations/20260911074000_bard_stage2_superior_inspiration_v2.sql`.

## Stage 3 — spell runtime — COMPLETE

Implemented and deployed on 2026-09-11.

- migration: `supabase/migrations/20260911080000_bard_stage3_spell_runtime_v1.sql`;
- package test: `tests/bardSpellRuntimeStage3.test.ts`;
- production revision: `xphb-2024-bard-stage3-spell-runtime-v1`;
- exact Bard cantrip progression and exact prepared-spell progression are active;
- selected spells resolve into native Charisma spell accesses and consume the shared spell-slot ledger;
- source-level tests prove Magical Secrets uses Bard level rather than total character level;
- Magical Secrets expands only levelled spell selection, never the Bard cantrip list;
- `sheet_profile_deferred=false`; the executable profile is now active;
- transaction smoke tests verified Bard 10 slot maxima, one spent 3rd-level slot surviving the Bard 10→11 sync, and the new 6th-level slot appearing at Bard 11;
- production audit confirms 11 cantrip options, 457 levelled options, 468 spell links and zero Magical Secrets gate mismatches;
- private Stage 3 installer/sync helpers are closed to `anon` and `authenticated` and executable by `service_role`.

Next implementation target: **Stage 4 — remaining base mechanics**.

## Stage 4 — remaining base mechanics — COMPLETE

Implemented and deployed on 2026-09-11.

- migration: `supabase/migrations/20260911101000_bard_base_runtime_stage4_v1.sql`;
- package test: `tests/bardBaseRuntimeStage4.test.ts`;
- production revision: `xphb-2024-bard-stage4-base-runtime-v1`;
- Expertise persists through Choice Runtime v2 and increases from 2 to 4 selections at Bard 9;
- only rank-1 owned skills are eligible for a new Expertise pick; existing Expertise selections remain stored when the count later increases;
- proficiency resolution now merges grants across choice variants, closing a generic CE bug that could hide proficiency choices behind non-default variant identities;
- Jack of All Trades is implemented by the generic `skill_check:untrained_proficiency_fraction` permission and affects untrained skills only, never initiative;
- Countercharm is a structured Reaction action with a 30-foot emanation and exact reroll-with-Advantage consequence; trigger legality remains on the table boundary;
- Power Word Heal and Power Word Kill are always-prepared Bard spell accesses at level 20 and continue to spend the shared slot ledger;
- Words of Creation exposes the optional second target within 10 feet of the first as a structured rule without inventing target-state tracking;
- ASI and Epic Boon are represented as generic feat-choice hooks because no first-class feat/allocation runtime exists yet; no Bard-specific picker was added;
- production dry-run, pre-deploy provider smoke, live audit and post-deploy smoke all passed;
- Supabase advisors reported no new Bard/provider findings.

Next implementation target: **Stage 5 — subclasses**.

## Stage 5 — subclasses — COMPLETE

Implemented and deployed on 2026-09-11.

- migration: `supabase/migrations/20260911162000_bard_subclasses_stage5_v1.sql`;
- package test: `tests/bardSubclassesStage5.test.ts`;
- production revision: `xphb-2024-bard-stage5-subclasses-runtime-v1`;
- runtime subclass count: 9;
- PHB 2024 runtime: Dance, Glamour, Lore, Valor;
- approved legacy/supplement runtime: Eloquence, Swords, Whispers, Creation, Spirits;
- College of Dance was added to the authored Bard reference roster with exact 2024 reference rules;
- College of Tragedy remains `referenceOnly` and has zero active builtin runtime templates;
- every runtime subclass has `parent_template_id = class:bard`, `unlock_level = 3` and parent-level source semantics;
- every BI-tagged spender uses `bardic_inspiration`; subclass-specific pools such as Infectious Inspiration remain independent finite resources rather than fake copies of the base pool;
- Glamour has native always-prepared Charm Person, Mirror Image and Command accesses plus persistent finite resources/actions;
- Lore has three bonus skill choices, Cutting Words and a persistent two-spell Magical Discoveries choice from Cleric/Druid/Wizard lists;
- Valor uses native proficiency/permission grants and structured Combat Inspiration / Extra Attack / Battle Magic rules;
- Swords uses a shared fighting-style choice and three canonical BI-backed Flourish actions;
- Whispers, Creation and Eloquence finite pools use shared resource/action runtime;
- Spirits uses the spell catalog for Guidance, Tales from Beyond structured semantics and a long-rest-refresh Spirit Session spell choice;
- all action source packages have exact feature explanations, enforced again by migration certification;
- dry-run, full CI, production deployment, live audit and post-deploy assignment/resource smoke all passed;
- production contains one Stage 5 Bard campaign installer and no obsolete Bard Stage 4 installer;
- production private installer/upsert helpers are closed to `anon` and `authenticated` and executable by `service_role` only;
- Supabase advisors report no Bard/Stage5-specific findings.

Next implementation target: **Stage 6 — final certification**.

## Stage 6 — certification — COMPLETE

Implemented and deployed on 2026-09-11.

- migration: `supabase/migrations/20260911175500_bard_runtime_final_certification_v1.sql`;
- package test: `tests/bardRuntimeFinalCertification.test.ts`;
- production migration: `bard_runtime_final_certification_v1`;
- production journal: `20260911150941`;
- production revision: `xphb-2024-bard-runtime-final-v1`;
- `runtime_stage = 6`;
- `mechanics_status = READY`;
- `runtime_status = ready`;
- public Bard reference: runtime-backed;
- runtime subclasses: 9/9 ready;
- Tragedy: reference-only, active builtin runtime count 0;
- broken resource references: 0;
- duplicate mechanic IDs: 0;
- final Bard campaign installer: `aaaaaaaal_campaigns_ensure_bard_runtime_final_v1`;
- final certifier/installer privileges: `anon=false`, `authenticated=false`, `service_role=true`;
- Class tab regression proves Bard resource/action entries come from `presentClassPackages()` over the resolved CE contract;
- Chat regression proves template actions/spells use GENA v2 routes and Bard choices use the generic Choice Runtime, with no Bard-specific UI branch;
- multiclass regression proves subclass feature levels use the Bard parent assignment rather than total character level;
- public reference regression exposes the nine certified colleges as runtime-backed while Tragedy remains reference-only;
- final pre-documentation CI: build green, lint green, full suite `990/990`;
- final production smoke and advisor audit passed.

## Generic cross-class debt outside Supported Bard Runtime V1

These are real project-wide capabilities that remain unfinished, but they are not implemented or faked inside Bard and therefore do not invalidate the certified Bard runtime that the application currently supports:

- **Multiclass entry grants.** 2024 multiclass Bard entry proficiencies differ from starting as Bard. The generic class-assignment model still has no first-class “starting class vs later multiclass entry” grant mode. Production metadata records `multiclass_entry_profile_runtime = generic_pending`.
- **Combined multiclass spell slots.** The project still lacks one generic caster-level aggregator across multiple spellcasting class assignments. Existing class synchronizers can own the shared `spell_slot_*` ledger independently. Production metadata records `multiclass_spell_slot_aggregation_runtime = generic_pending`.
- **Feat / bounded ability allocation.** The repository still lacks a first-class generic feat source and bounded ASI allocation primitive. Bard keeps precise generic `feat_choice` hooks and records `feat_source_runtime = generic_pending`.

What *is* certified for multiclass use is parent/source-level semantics: Bard subclass progression and Bard-gated choices use Bard level, not total character level.

These debts must be solved once as shared systems for every affected class. Do not add `if bard` branches to the sheet, GM panel, feat flow or shared spell-slot owner.

