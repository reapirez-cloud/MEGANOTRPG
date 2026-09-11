# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 1: FOUNDATION.**

The canonical `class:bard` template may exist and be assigned, but the public Bard reference must remain `referenceOnly` until the final certification gate below is complete.

Stage 1 owns only:

- stable `class:bard` / `bard-core` identity;
- d8 Hit Die;
- Dexterity and Charisma saving-throw proficiencies;
- light armor and simple weapons;
- three player-selected skills from the full skill list;
- three player-selected musical instruments;
- structural Bard feature unlocks from levels 1-20;
- inert, audited 2024 spell/progression and Bardic Inspiration contracts in `rules_meta`.

Stage 1 deliberately does **not** activate a `sheet_profile`. In MEGANOTRPG that field is executable assignment data and immediately changes the character sheet and spell slots. It must only be promoted from the inert `spellcasting_contract` when the real persistent spell-slot/selection runtime is installed.

## Stage 2 — Bardic Inspiration

Create one canonical Shapoklyak-backed resource:

- state key: `bardic_inspiration`;
- maximum: Charisma modifier, minimum 1;
- die: d6 at Bard 1, d8 at 5, d10 at 10, d12 at 15;
- recovery: Long Rest at levels 1-4; Short or Long Rest from level 5;
- spending goes through the shared GENA/template-action path;
- Font of Inspiration can expend a spell slot, without an action, to restore one expended use;
- Superior Inspiration at Bard 18 raises the available pool to at least two when initiative is rolled.

Assignment/level/Charisma synchronization must preserve the spent deficit, survive reload, and remove orphaned Bard state when the class is removed.

Do not create a Bard-only resource table.

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
