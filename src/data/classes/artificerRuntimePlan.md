# Artificer runtime plan — 2026-09-21

> Internal implementation contract. Player-facing literary text is intentionally
> deferred: translation, author_description, author_comment, feature explanations
> and Voss prose will be supplied by the user later.

## Canonical target

Create one clean runtime-backed `class:artificer` from **Eberron: Forge of the
Artificer (2025)** through the existing Chasovoy → owner → Character Engine path.

Frozen supported subclasses:

1. Alchemist
2. Armorer
3. Artillerist
4. Battle Smith
5. Cartographer

Canonical Stage 1 sources inside the repository:

- `src/data/classes/artificerReferenceCurrent.ts`
- `src/data/classes/artificerRuntimeFeatureMatrix.md`
- `src/data/classes/artificerRuntimeReuseAudit.md`

The literary layer is not a mechanics dependency. Blank narrative/translation
fields are valid until the user supplies them.

## Current checkpoint

- Stage 1 — source freeze/specification: COMPLETE_2026_09_21
- Stage 2 — class foundation 1–20 + spellcasting: NEXT
- Stage 3 — core item/replication runtime: NOT_STARTED
- Stage 4 — remaining base class 1–20: NOT_STARTED
- Stage 5 — subclass wave 1: NOT_STARTED
- Stage 6 — subclass wave 2 + UX/runtime reconciliation: NOT_STARTED
- Stage 7 — final certification: GATE_INSTALLED_BLOCKED

## Stage 1 — source freeze/specification

**Status:** `COMPLETE_2026_09_21`

Closed deliverables:

- canonical source frozen to Eberron: Forge of the Artificer (2025);
- exact runtime roster frozen to five subclasses;
- 10 base named feature identities frozen;
- 33 subclass named feature identities frozen;
- 43 total stable feature keys assigned;
- retired historical `artificer-reanimator` explicitly excluded;
- old generic Artificer installer audited as selective structural reference only;
- production spell links audited: current 29 links are stale/incomplete and cannot
  be treated as the 2025 spell list;
- shared owner reuse decisions frozen for Chasovoy, Shapoklyak, Cheburashka, GENA,
  CE, Snake and Chat;
- missing generic primitives identified before runtime authoring;
- public Artificer reference added as `referenceOnly: true`;
- all literary/Voss fields deliberately remain blank.

Stage 1 makes **no class/runtime database rows** and does not claim the class is
playable. Its job is to prevent Stage 2 from improvising architecture or reviving
the retired legacy catalog.

## Stage 2 — class foundation 1–20 + spellcasting

**Status:** `NEXT`

Target:

- create exactly one active builtin `class:artificer`;
- create all 20 level rows;
- encode base traits/proficiencies and class progression;
- reconcile the current official 2025 Artificer spell list with the shared spell
  catalog instead of trusting the existing 29 links;
- implement Intelligence spellcasting through the shared spell runtime;
- encode cantrip replacement and prepared-spell progression;
- establish subclass unlock at Artificer level 3;
- establish generic magic-item-plan option provider needed by Stage 3;
- keep `referenceOnly` and non-READY status.

Gate: low/mid/high representative Artificer bundles must pass package quality,
parser → CE and `ResolvedCharacterContract` without class-specific Sheet/Chat logic.

## Stage 3 — core item/replication runtime

**Status:** `NOT_STARTED`

Target:

- Tinker's Magic;
- Replicate Magic Item;
- plan choices and plan tiers;
- real Cheburashka-created instances;
- Long-Rest loadout reconciliation;
- class-created instance provenance/lifecycle;
- attunement integration;
- required generic item/slot primitives.

## Stage 4 — remaining base class 1–20

**Status:** `NOT_STARTED`

Target:

- Magic Item Tinker;
- Flash of Genius;
- Magic Item Adept;
- Spell-Storing Item;
- Advanced Artifice;
- Magic Item Master;
- Soul of Artifice;
- cross-owner zero-HP rescue orchestration;
- base-class mechanical certification.

## Stage 5 — subclass wave 1

**Status:** `NOT_STARTED`

Target subclasses:

- Alchemist
- Armorer
- Artillerist

All subclass features use shared owners/runtime primitives. Generated elixirs,
Arcane Armor modes and Eldritch Cannons must not become parallel inventory or
combat engines.

## Stage 6 — subclass wave 2 + UX/runtime reconciliation

**Status:** `NOT_STARTED`

Target subclasses:

- Battle Smith
- Cartographer

Then reconcile all five subclasses through:

- Character Engine;
- Sheet;
- new Chat;
- GENA action/spell execution;
- Snake;
- suppression;
- Long Rest / Short Rest;
- reload and level changes.

Steel Defender and Eldritch Cannon are explicit class constructs/companions, not an
automatic tactical GM.

## Stage 7 — final certification

**Status:** `GATE_INSTALLED_BLOCKED`

The private certifier already exists because the user accidentally requested Stage 7
before Stage 1. It is harmless and deliberately fail-closed:

`private.certify_artificer_runtime_final_v1(uuid)`

Target revision:

`eberron-2025-artificer-runtime-final-v1`

It cannot write READY until the database contains one active builtin Artificer, all
20 level rows, the exact five-subclass roster, completed Stage 1–6 metadata, coherent
choices/actions/resources, spell access and valid shared RPC permissions.

No auto-certification trigger is installed while Stages 1–6 are absent.

## Literary policy

- do not invent Voss prose;
- do not invent the user's Russian literary translation;
- keep `author_description` / `author_comment` blank unless supplied by the user;
- reference `explanation` / `voss` may remain blank;
- exact structured mechanics can be implemented without literary text;
- no quality/certification gate may fail solely because those literary fields are blank.
