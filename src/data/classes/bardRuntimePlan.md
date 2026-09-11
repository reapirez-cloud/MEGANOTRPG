# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 4: BASE RUNTIME READY.**

The canonical `class:bard` foundation, Bardic Inspiration, spell runtime and remaining 2024 base-class runtime are deployed to production. The player-facing Bard reference remains `referenceOnly` until subclass work and final certification are complete.

Production revision: `xphb-2024-bard-stage4-base-runtime-v1`.

Stage 4 now owns:

- Expertise as one persistent choice: 2 already-proficient skills at Bard 2, growing to 4 at Bard 9, each resolving to proficiency rank 2;
- a generic `skill_proficiencies` dynamic choice provider shared by future rules. The client derives eligible skills from sheet + active template grants and the server independently validates every newly added option;
- Jack of All Trades as a generic untrained-skill proficiency fraction: half PB, rounded down, only for skill checks with proficiency rank 0; initiative remains untouched;
- Countercharm as a structured Reaction with the exact 30-foot failed-save reroll/Advantage rule. The failed-save trigger and reaction legality remain table-adjudicated rather than fake runtime state;
- Words of Creation as two separate always-prepared CE spell accesses for Power Word Heal and Power Word Kill plus the structured second-target-within-10-feet rule;
- precise structured ASI hooks at Bard 4/8/12/16 and Epic Boon hook at Bard 19.

The repository still has no first-class generic feat source/allocation runtime. Stage 4 therefore deliberately does **not** add a Bard-specific feat picker. ASI/Epic Boon are exact generic `feat_choice` hooks until that shared subsystem exists. This is architecture debt, not a reason to fork Bard UI.

Production migration: `bard_base_runtime_stage4_v1` (journal `20260911101327`).

The production post-deploy smoke verified that a starting Bard skill is recognized as rank 1 by the generic provider, an eligible Expertise selection passes, an untrained skill is rejected, and both Words of Creation spell links remain present. Final Stage 4 code CI passed build, lint and `970/970` tests.

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

## Stage 5 — subclasses

First complete the Player's Handbook 2024 roster:

1. College of Dance — currently missing from the authored Bard roster;
2. College of Glamour;
3. College of Lore;
4. College of Valor.

Then complete the approved legacy/supplement roster through the same CE/template primitives:

- College of Eloquence;
- College of Swords;
- College of Whispers;
- College of Creation;
- College of Spirits.

College of Tragedy remains `referenceOnly` unless the project explicitly approves the Tal'Dorei third-party package for gameplay.

Every subclass feature that spends Bardic Inspiration must reference the same canonical `bardic_inspiration` resource. Do not create subclass copies of the pool.

## Stage 6 — certification

Bard becomes mechanically READY only after all of these pass:

- strict class package quality gate;
- low/mid/high Bard-level parser -> CE tests;
- multiclass tests use Bard source level, not total character level;
- Bardic Inspiration max, die scaling, spending and recovery survive reload;
- Expertise choices persist and only eligible skills can be selected;
- Jack of All Trades uses the exact 2024 skill-only rule;
- spell progression, replacements and Magical Secrets are source-gated correctly;
- every supported subclass uses parent Bard level and has no broken resource references;
- Class tab consumes the resolved CE contract;
- Chat execution uses GENA/shared template RPCs;
- production Supabase matches the intended repository package;
- build, lint and full tests pass.

Only after that gate:

- set `mechanics_status = READY`;
- mark runtime certification metadata;
- change the player-facing Bard from `referenceOnly: true` to runtime-backed.

## Generic debt to settle before final certification

- 2024 multiclass Bard entry proficiencies differ from starting as Bard: multiclassing grants a narrower set of proficiencies. The current generic class-assignment model does not yet distinguish first-class entry grants from multiclass entry grants. Solve that as a generic class primitive before final Bard certification.
- The shared spell-slot ledger does not yet have a generic multiclass caster-level aggregator across multiple assigned spellcasting classes. Existing class-specific slot synchronizers can therefore overwrite the same `spell_slot_*` base maxima if true multiclass spellcasting is enabled. Solve this once for all full/half/third casters rather than adding a Bard-only branch.
- The project still lacks first-class feat sources and the bounded ability-score allocation primitive required to execute ASI/Epic Boon choices generically. Stage 4 stores exact shared hooks; final certification must not invent a Bard-only feat system.

Do not add `if bard` branches to the sheet, GM panel or shared spell-slot owner.
