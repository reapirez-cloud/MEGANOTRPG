# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 2: BARDIC INSPIRATION RUNTIME READY.**

The canonical `class:bard` foundation and Stage 2 resource package are deployed to production. The public Bard reference must still remain `referenceOnly` until the final certification gate below is complete.

Stage 1 remains the structural foundation: identity, d8 Hit Die, core proficiencies, starting skill/instrument choices, the 1–20 feature tree, and the inert audited spell progression contract.

Stage 2 now owns:

- one canonical Shapoklyak-backed `bardic_inspiration` resource;
- maximum equal to the Charisma modifier, minimum 1;
- die value `d6 → d8 → d10 → d12` at Bard levels `1 / 5 / 10 / 15`;
- Long Rest recovery at levels 1–4 and Short/Long Rest recovery from level 5;
- a real bonus-action Bardic Inspiration spender through the shared template-action path;
- Font of Inspiration using the shared `spell_slot_1…9` ledger to restore one expended use without an action;
- Superior Inspiration as a structured free action that is engine-blocked unless current uses are below two, while the initiative trigger itself remains table-adjudicated because the application does not own authoritative initiative state;
- assignment, Bard-level and Charisma synchronization that preserves spent deficit and removes orphaned Bard resource state.

The generic server formula evaluator was corrected so `abilities.*.(score|modifier)` reads the real scalar ability columns on `character_sheets`. The CE action contract now supports a generic upper bound on resource requirements and the shared resource runtime hydrates/persists `temporary_max_bonus`, matching the server runtime.

Stage 2 deliberately does **not** activate Bard spell preparation, Bard spell slots, subclasses, or an executable `sheet_profile`. A pure Bard therefore cannot use Font's slot-conversion action until Stage 3 creates the canonical shared spell-slot ledger. A multiclass character with real shared spell slots can use the same action without any Bard-specific slot storage.

Production revision: `xphb-2024-bard-stage2-inspiration-v2`.

## Stage 2 — Bardic Inspiration — COMPLETE

Implemented and deployed on 2026-09-11.

- state key: `bardic_inspiration`;
- maximum: Charisma modifier, minimum 1;
- die: d6 at Bard 1, d8 at 5, d10 at 10, d12 at 15;
- recovery: Long Rest at levels 1–4; Short or Long Rest from level 5;
- spending goes through the shared GENA/template-action path;
- Font of Inspiration spends one canonical shared spell slot and restores one expended use;
- Superior Inspiration never reduces an existing pool of two or more uses and still reaches two when the ordinary Charisma-based maximum is only one. It uses generic `ENSURE_MINIMUM` plus temporary capacity that survives reload and is removed on Long Rest; its initiative trigger stays on the table/GM adjudication boundary rather than becoming fake runtime state;
- assignment/level/Charisma synchronization preserves spent deficit and removal cleans orphaned state;
- no Bard-only resource table exists;
- Stage 2 closure migration: `supabase/migrations/20260911074000_bard_stage2_superior_inspiration_v2.sql`;
- production v2 smoke test covered the `CHA +1` edge, reload preservation and absorption of temporary capacity when the persistent maximum rises.

Next implementation target: **Stage 3 — spell runtime**.

## Stage 3 — spell runtime

Promote the audited Stage 1 spell contract into active runtime:

- Charisma spellcasting;
- Bard spell catalog;
- full-caster spell slots;
- cantrips: 2 at level 1, 3 at level 4, 4 at level 10;
- prepared spells: exact 2024 progression through 22 at level 20;
- persistent selections and one cantrip replacement plus one prepared-spell replacement on a Bard level gain;
- musical instrument as spellcasting focus;
- Magical Secrets from Bard 10 expands new and replacement choices to Bard, Cleric, Druid and Wizard lists;
- only at this stage add the executable `sheet_profile` and persistent spell-slot synchronization.

The production spell catalog already contains Bard class links; reuse the shared spell catalog/slot primitives rather than adding Bard-owned spell storage.

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

2024 multiclass Bard entry proficiencies differ from starting as Bard: multiclassing grants a narrower set of proficiencies. The current generic class-assignment model does not yet distinguish first-class entry grants from multiclass entry grants. Solve that as a generic class primitive before final Bard certification. Do not add a `if bard` branch to the sheet or GM panel.
