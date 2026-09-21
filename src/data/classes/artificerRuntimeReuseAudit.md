# Artificer Stage 1 Reuse Audit

> Audited 2026-09-21 on `dev` and the connected production Supabase project.

## Decision

Build the 2025 Artificer as a **clean package**. The historical builtin Artificer
was retired with the other legacy generated packages and must not be restored
wholesale.

Canonical source target:

- **Eberron: Forge of the Artificer (2025)**
- revised Artificer class;
- supported subclasses: Alchemist, Armorer, Artillerist, Battle Smith, Cartographer.

The official release support notes are useful evidence for architecture: even the
official character builder cannot natively automate several core features
(Tinker's Magic item creation, Magic Item Tinker slot/charge exchange,
Spell-Storing Item, and part of Advanced Artifice). MEGANOT must implement these
through its existing owner/runtime architecture rather than hiding them behind text.

## Historical builtin Artificer — ADAPT, DO NOT RESTORE

Historical sources:

- `supabase/migrations/20260827180000_official_class_catalog.sql`
- `supabase/migrations/20260827180100_official_subclass_catalog.sql`

Retirement source:

- `supabase/migrations/20260829235500_remove_legacy_builtin_classes.sql`

Useful structural facts that may be adapted after comparison with the 2025 freeze:

- d8 Hit Die;
- Intelligence spellcasting;
- Constitution + Intelligence saves;
- two class skills from the historical Artificer skill set;
- Light/Medium armor and Shield training;
- Simple weapons;
- Thieves' Tools, Tinker's Tools and an Artisan's Tools choice;
- 20-level half-caster slot skeleton;
- subclass unlock at level 3;
- ASI/feat hooks at 4/8/12/16 and Epic Boon at 19;
- feature-level skeleton for the current 2025 base class.

Useful historical executable fragment:

- the old Flash of Genius row already demonstrates the generic resource/action shape.
  It is only an implementation-shape reference. Its exact limits/trigger/recovery must
  come from the 2025 source freeze.

Historical rows with `runtime: []` are not runtime truth.

## Explicit historical discard

The old subclass installer contains `artificer-reanimator`.

It is **not** part of Eberron: Forge of the Artificer and is outside the frozen
supported roster. Stage 2+ must not install, count, certify, expose as runtime-ready,
or silently inherit this subclass.

## Existing shared infrastructure to reuse

### Chasovoy

Owns reusable definitions:

- class/subclass definitions;
- spells;
- magic-item definitions;
- future Artificer plan eligibility metadata.

Replicate Magic Item stores stable references to these definitions. It must not copy
a second magic-item catalog into the class package.

### Shapoklyak

Already owns character runtime facts:

- template assignments;
- persistent choices;
- class resources;
- spell/preparation state;
- character HP.

Flash of Genius, plan choices, Armor Model choices and similar persistent facts belong
here unless they are item-instance state.

### Cheburashka

Already owns:

- item instances;
- holder/quantity;
- charges;
- equipment and per-instance state;
- transfers and consumption.

Tinker's Magic creations, replicated magic items, Experimental Elixirs and
Spell-Storing Item bindings must be built on this owner instead of an
`artificer_items` shadow inventory.

### GENA / CE / Snake / Chat

- GENA remains the normal gameplay orchestrator.
- CE remains pure and consumes projections only.
- Snake presents typed actions and dispatches to the existing control path.
- Sheet and Chat consume the same `ResolvedCharacterContract`.
- No Artificer-only chat mechanics engine is allowed.

## Current spell catalog audit

Live production currently contains **29** `spell_catalog_classes` links for
`class_key='artificer'`.

That set is clearly incomplete for the current 2025 class and must not be treated as
the canonical spell list. Stage 2 must reconcile the current official Artificer
spell list against the shared spell catalog before exposing Spellcasting as ready.

Known supplemental-source spells whose own published descriptions add them to the
Artificer spell list include:

- Air Bubble
- Ashardalon's Stride
- Booming Blade
- Create Spelljamming Helm
- Green-Flame Blade
- Intellect Fortress
- Kinetic Jaunt
- Lightning Lure
- Summon Construct
- Sword Burst
- Tasha's Caustic Brew
- Vortex Warp

The shared spell catalog is the owner; these must be links, not duplicate spell rows.

## Current live runtime audit

Connected production Supabase:

- active builtin `class:artificer`: **0**
- active supported Artificer subclasses: **0**
- Artificer level rows: **0**
- current Artificer spell links: **29**
- Stage 7 private fail-closed certifier: installed, but intentionally blocked

No Stage 1 database mutation is required. Stage 1 freezes source and architecture;
Stage 2 will introduce the clean runtime package.

## Reuse decisions

| Existing material | Decision | Reason |
|---|---|---|
| 2025 Eberron class/subclass source | REUSE AS CANON | Current target rules |
| Historical Artificer class skeleton | ADAPT | Useful structure; old package is retired |
| Historical Flash resource/action shape | ADAPT | Generic engine shape only |
| Historical subclass spell lists | VERIFY THEN ADAPT | Likely useful, but parity must be checked against current source/catalog |
| Historical generated descriptions | DISCARD | Not authoritative mechanics and user wants literary layer later |
| Historical `runtime: []` rows | DISCARD AS RUNTIME | Documentation-only shells |
| Historical Reanimator subclass | DISCARD FROM ROSTER | Not in frozen 2025 five-subclass set |
| Existing Choice Runtime | REUSE | Persistent/rest-refresh choices already exist |
| Existing spell runtime | REUSE | One spell owner/executor |
| Cheburashka inventory | REUSE | Canonical item-instance owner |
| GENA action/session path | REUSE | Required cross-owner orchestration |
| New Artificer-only inventory tables | FORBIDDEN BY DEFAULT | Would duplicate ownership |

## Stage 2 blockers / prerequisites

Stage 2 may create the class foundation and spellcasting immediately, but it must also
introduce or schedule the generic primitives documented in
`artificerRuntimeFeatureMatrix.md` rather than hiding gaps behind prose.

The most important early prerequisite is the magic-item-plan option provider:
Replicate Magic Item cannot become a hard-coded list embedded in every campaign.

## Literary policy

The user will supply the translation/literary layer later.

Therefore:

- `author_description` may be blank;
- `author_comment` may be blank;
- reference `explanation` may be blank;
- reference `voss` may be blank;
- mechanical readiness must never depend on those fields;
- do not fabricate replacement prose just to satisfy a completeness test.

Stage 1 is mechanically complete when the source matrix, supported roster, stable
feature identities, reuse decisions and generic runtime gaps are frozen.
