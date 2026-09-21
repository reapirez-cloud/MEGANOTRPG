# Rogue runtime reuse audit — 2026-09-21

> Internal implementation checkpoint before Rogue Stage 2.
> This document answers one question only: what existing Rogue work is reusable,
> what must be adapted to the current shared runtime, and what must remain retired.
> It does not activate Rogue mechanics and it does not change the frozen rules scope.

## Result

**Status:** `COMPLETE_2026_09_21`  
**Next executable stage:** `Stage 2 — clean class foundation and 1–20 progression`

The Rogue implementation is **not a greenfield rewrite**.

There are three distinct existing layers:

1. the current exact literary/reference package and Stage 1 feature matrix;
2. a retired historical builtin Rogue package in migration history;
3. shared runtime infrastructure implemented later by other classes.

The correct implementation strategy is to preserve the current exact reference/matrix,
reuse only historically correct executable fragments, and rebuild the active
`class:rogue` package on the current generic CE/GENA/Choice Runtime contracts.

## Current authoritative Rogue material — REUSE AS SOURCE OF TRUTH

These files are authoritative for supported identity, rule text and runtime ownership:

- `src/data/classes/rogueReferenceCurrent.ts`
- `src/data/classes/rogueSubclassReferenceWave1.ts`
- `src/data/classes/rogueSubclassReferenceWave2.ts`
- `src/data/classes/rogueSubclassReferenceWave3.ts`
- `src/data/classes/rogueRuntimeFeatureMatrix.md`
- `src/data/classes/rogueRuntimePlan.md`

Frozen supported roster:

- `subclass:rogue:thief`
- `subclass:rogue:assassin`
- `subclass:rogue:arcane-trickster`
- `subclass:rogue:soulknife`
- `subclass:rogue:swashbuckler`
- `subclass:rogue:inquisitive`
- `subclass:rogue:mastermind`
- `subclass:rogue:scout`
- `subclass:rogue:phantom`

The exact supported scope remains 15 base features + 46 subclass features = 61.

## Historical builtin Rogue — ADAPT, DO NOT RESTORE WHOLESALE

Historical source:

- `supabase/migrations/20260827180000_official_class_catalog.sql`
- `supabase/migrations/20260827180100_official_subclass_catalog.sql`

That package was intentionally removed by:

- `supabase/migrations/20260829235500_remove_legacy_builtin_classes.sql`
- `supabase/migrations/20260830000500_retire_legacy_class_bootstrap_triggers.sql`

It must not be resurrected as a catalog installer. Useful fragments may be ported
into the current architecture only after comparison with the frozen Rogue matrix.

### Historical base class findings

Useful structural data:

- hit die: d8;
- saving throws: Dexterity, Intelligence;
- four starting Rogue skills;
- light armor;
- Thieves' Tools;
- Rogue subclass unlock at level 3;
- ASI hooks at 4/8/10/12/16 and Epic Boon at 19;
- feature-level skeleton 1–20.

Historical executable fragment worth adapting:

- `Cunning Action` already had three CE action definitions:
  - Dash / `cunning_dash`;
  - Disengage / `cunning_disengage`;
  - Hide / historical label `Засада`, which must be normalized to the current exact naming/rule text.

These actions use the same broad action shape the current engine still understands:
`type=action`, `economy=bonus_action`, self range, class tags. The definitions
should be rewritten with current stable IDs/source keys and current presentation,
not copied byte-for-byte.

### Historical base class material that is NOT executable truth

Most historical feature rows contain a prose-summary `mechanic` object but an empty
`runtime: []`. Those rows are documentation-era metadata, not functioning CE mechanics.

Examples that must be implemented from the current matrix rather than trusted from
the old catalog:

- Sneak Attack progression and eligibility;
- Expertise;
- Thieves' Cant + extra language;
- Weapon Mastery;
- Steady Aim;
- Cunning Strike / Improved Cunning Strike / Devious Strikes;
- Uncanny Dodge;
- Evasion;
- Reliable Talent;
- Slippery Mind;
- Elusive;
- Stroke of Luck.

Known historical inaccuracies/insufficiencies include:

- the old Slippery Mind summary only listed Charisma save impact and therefore does
  not represent the frozen 2024 Wisdom + Charisma proficiency rule;
- old class naming is `Плут`, while the current canonical public identity is
  `Разбойник`;
- historical summaries do not encode the exact current Cunning Strike contracts;
- no real Sneak Attack dice progression runtime existed.

## Historical subclasses — selective adaptation only

The historical builtin catalog contains the nine currently supported families plus
an extra `rogue-scion-of-the-three`.

### Explicit discard

`rogue-scion-of-the-three` is **OUTSIDE the frozen supported roster** and must not
be installed, linked, certified or counted as a supported Rogue subclass.

### Historical fragments that can inform current action authoring

These old action shells are mechanically useful only as UI/action-shape references:

- Inquisitive: Unerring Eye action;
- Mastermind: Misdirection reaction;
- Scout: Sudden Strike bonus action;
- Swashbuckler: Panache action and historical Elegant Maneuver action;
- Arcane Trickster: Spell Thief reaction shell;
- Phantom: Tokens of the Departed reaction shell and Ghost Walk bonus action.

They are **not** approved as exact runtime implementations. Their current rule
semantics must come from `rogueRuntimeFeatureMatrix.md`.

### Historical subclass data that must not be trusted as exact rules

- old subclass feature packs frequently collapsed multiple real features into one
  generic row;
- several rows use generated labels such as `Subclass · 13 уровень`;
- historical Phantom source metadata does not match the currently frozen Tasha
  contract;
- historical Arcane Trickster only linked Mage Hand and did not implement the real
  shared spell progression/runtime;
- historical Soulknife had no real Psionic Energy Dice runtime;
- historical Thief/Assassin packages were mostly reference shells;
- historical Mastermind/Scout rules predate the current corrected feature audit.

Therefore old subclass rows are reference material only unless a specific action
shape is deliberately re-authored against the current matrix.

## Shared infrastructure already available — REUSE

The 2026-09-21 audit confirms the following generic infrastructure exists in current
dev and the connected Supabase project:

### Persistent choices

Choice Runtime v2 already supports:

- player-owned persistent choices;
- `count_by_level`;
- source-level validation;
- structured instances;
- long-rest refresh;
- replacement policies and replacement limits.

The deployed project includes the long-rest choice runtime migration. Therefore
Rogue Weapon Mastery replacement after Long Rest does **not** require a Rogue-specific
choice engine.

Existing dynamic provider:

- `skill_proficiencies`

This is reusable directly for Rogue Expertise.

### Actions and resources

Current CE/GENA supports:

- persistent resources;
- short/long-rest recovery;
- multiple resource costs;
- alternative `costOptions`;
- action requirements;
- structured semantic/resource effects;
- template actions and template rolls;
- inventory-backed actions;
- action routing into the new chat from the resolved CE contract.

Therefore Rogue abilities must appear through the existing class/action model and
must not receive a Rogue-only chat panel.

### Resource effects

The action engine already understands:

- RESTORE;
- SPEND;
- SET;
- GRANT_TEMPORARY_MAX;
- ENSURE_MINIMUM.

This means alternate resource payment and explicit minimum-setting operations have
usable generic building blocks, though rest-time ENSURE_MINIMUM is not yet a generic
resource recovery rule.

### Spell runtime

The shared spell runtime already owns:

- spell access grants;
- prepared state;
- attack/save formulas;
- resource/slot options;
- exact selected cast access/method/option;
- chat execution through the shared GENA spell path.

Arcane Trickster must use this runtime. No Rogue spell engine is allowed.

## Remaining generic gaps after reuse audit

These are the actual reusable infrastructure gaps still relevant to Rogue.

### Stage 2 blocker

1. **Dynamic proficient-weapon choice provider**
   - Needed for Weapon Mastery: choose two legal proficient weapon kinds.
   - Must be generic, analogous to `skill_proficiencies`.
   - Long-rest replacement itself already exists and is not a blocker.

### Stage 3 gaps

2. **Sneak-Attack-dice sacrifice/rider primitive**
   - Needed for Cunning Strike and later improvements.
   - Must represent reducing bonus damage dice without pretending those dice are a
     persistent resource.

### Stage 4 gap

3. **Authoritative d20 result override seam**
   - Needed for Stroke of Luck.
   - Must integrate with the shared roll path/Tobik rather than a local UI override.

### Stage 5 gaps

4. **Temporary spell access state**
   - Needed for Arcane Trickster Spell Thief's explicit temporary stolen-spell access.
   - Must be a shared spell-access capability.

5. **Conditional resource spending**
   - Needed where a die is spent only if it changes failure into success, notably
     Psi-Bolstered Knack and Homing Strikes.
   - Must be server-authoritative and reusable.

### Stage 6 gap

6. **Ensure-minimum-on-rest resource recovery**
   - Needed for Tasha Phantom Death's Friend fallback Soul Trinket.
   - Current action effects support ENSURE_MINIMUM, but ordinary persistent recovery
     supports full/amount/set only.
   - Extend generic recovery instead of writing a Phantom-only rest hook.

## Reuse decisions

| Existing material | Decision | Reason |
|---|---|---|
| Current Rogue reference files | REUSE | Canonical exact text/rules |
| Current feature matrix | REUSE | Canonical runtime ownership contract |
| Historical level/proficiency skeleton | ADAPT | Useful structure, old catalog identity is retired |
| Historical Cunning Action actions | ADAPT | Correct broad action shape, needs current IDs/text |
| Historical subclass action shells | ADAPT SELECTIVELY | Useful action/economy shape only |
| Historical generated mechanic summaries | DISCARD AS RUNTIME | Mostly non-executable and sometimes incomplete |
| Historical `runtime: []` rows | DISCARD AS RUNTIME | No mechanics to preserve |
| Historical Arcane Trickster spell handling | DISCARD | Not a real shared spell progression |
| Historical Soulknife handling | DISCARD | No Psionic resource runtime |
| `rogue-scion-of-the-three` | DISCARD FROM SUPPORTED ROSTER | Not in the frozen nine subclasses |
| Choice Runtime v2 | REUSE | Already solves Expertise/refresh foundations |
| Current CE resources/actions | REUSE | Shared authoritative path |
| Current spell runtime | REUSE | Required Arcane Trickster path |
| New isolated chat action routing | REUSE | Reads resolved CE actions/spells |

## Live database audit

Connected Supabase project on 2026-09-21:

- active builtin `class:rogue`: **0**;
- active Rogue subclasses: **0**;
- Rogue-specific migrations in the production migration list: **0**;
- generic long-rest choice refresh migration: deployed;
- generic Choice Runtime v2/replacement infrastructure: deployed.

No database mutation was required for this audit.

## Stage 2 handoff

Stage 2 should now begin from this exact rule:

**Do not reinstall the historical Rogue catalog.**

Instead:

1. create one current builtin `class:rogue`;
2. reuse/adapt the structural facts above;
3. implement current stable feature IDs from the frozen matrix;
4. add the one Stage 2 generic prerequisite: proficient-weapon dynamic choice provider;
5. persist Expertise and Weapon Mastery through Choice Runtime v2;
6. keep Rogue non-READY until later certification stages;
7. add targeted regression proving no retired extra subclass is installed.

No further archaeology is required before Stage 2.
