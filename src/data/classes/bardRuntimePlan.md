# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 3: SPELL RUNTIME READY.**

The canonical `class:bard` foundation, Bardic Inspiration runtime and 2024 Bard spell runtime are deployed to production. The player-facing Bard reference remains `referenceOnly` until the later base-mechanics, subclass and certification stages are complete.

Production revision: `xphb-2024-bard-stage3-spell-runtime-v1`.

Stage 3 now owns:

- Charisma spellcasting through native CE `class_spell` accesses;
- the exact full-caster slot progression from Bard 1–20 using the shared `spell_slot_1…9` persistent ledger;
- Bard cantrips as a persistent choice: 2 at level 1, 3 at level 4, 4 at level 10;
- exact prepared-spell counts `4/5/6/7/9/10/11/12/14/15/16/16/17/17/18/18/19/20/21/22`;
- one cantrip replacement and one prepared-spell replacement when the Bard source level increases;
- Bard-only cantrip choices, including replacements;
- Magical Secrets from Bard 10 for levelled spells only: new and replacement prepared spells may come from Bard, Cleric, Druid or Wizard lists, still gated by the highest spell level available to that Bard level;
- musical instruments as a structured spellcasting-focus permission;
- active executable `sheet_profile` with Charisma, Bard list metadata, full-caster slots and the audited cantrip/prepared progression;
- canonical spell links for every selectable access.

The production catalog currently resolves 11 Bard cantrips plus 457 selectable levelled spells across the Bard/Cleric/Druid/Wizard Magical Secrets union, for 468 template spell links. Magical Secrets gate parity is audited at zero mismatches.

The generic Choice Runtime parser was also corrected so `target: "spell"` is a first-class typed choice target and selected spell choices emit only their canonical `option_mechanics`. It no longer creates a second empty spell grant with no payload. This is a generic fix and also removes a latent failure mode from existing spell-choice packages such as Sorcerer.

Stage 3 deliberately does **not** complete Expertise, Jack of All Trades, Countercharm, Words of Creation, feat/ASI runtime or subclasses. Those remain later stages.

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

## Stage 4 — remaining base mechanics

Use generic mechanics where the rules expose generic needs:

- Expertise: persistent choice of two already-proficient skills at Bard 2 and two more at Bard 9. If the current choice runtime cannot derive options from owned proficiencies, add a generic dynamic option provider first.
- Jack of All Trades: generic half-proficiency bonus rule for skill-based ability checks in which the character lacks proficiency. It no longer applies to initiative in the 2024 rules.
- Countercharm: structured reaction rule. Scene trigger/legality stays with the GM; no turn tracker.
- Words of Creation: Power Word Heal and Power Word Kill always prepared plus the limited second-target rule.
- ASI/Epic Boon: use the shared feat/allocation system when available, never a Bard-specific picker.

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

Do not add `if bard` branches to the sheet, GM panel or shared spell-slot owner.
