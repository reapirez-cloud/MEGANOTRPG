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
- Stage 2 — class foundation 1–20 + spellcasting: COMPLETE_2026_09_21
- Stage 3 — core item/replication runtime: COMPLETE_2026_09_21
- Stage 4 — remaining base class 1–20: NEXT
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

**Status:** `COMPLETE_2026_09_21`

Closed deliverables:

- exactly one active builtin `class:artificer` is installed per campaign;
- all 20 level rows exist with the 2025 cantrip, prepared-spell and slot progression;
- d8, Constitution/Intelligence saves, Light/Medium armor + Shields, Simple weapons,
  class skills and tool training are encoded through shared grants/choices;
- the stale 29-link spell state is replaced by the frozen 92-spell 2025 target;
- six missing shared spell definitions were added to the common spell catalog with
  concise structured metadata rather than copied source prose;
- Intelligence spellcasting and `spell_slot_1..5` use the shared CE/GENA resource path;
- Tinker's Magic grants Mending independently of the ordinary cantrip quota;
- one cantrip may be replaced after each Long Rest; the full levelled preparation
  set may be refreshed after Long Rest through Choice Runtime;
- subclass unlock is frozen at level 3 while all subclass runtime remains disabled;
- generic Chasovoy-backed `reference_item_plans` validation now exists for Stage 3;
- ASI/Epic Boon deliberately stay on the existing normal sheet/GM path until the
  repository gains a generic feat-source runtime;
- `referenceOnly` remains true and no final READY state is written.

Runtime revision:
`efota-2025-artificer-stage2-foundation-spellcasting-v1`.

Live Stage 2 audit: 1 active Artificer, 20 level rows, 92 class spell links,
92 template spell links, 0 active Artificer subclasses, and blank author fields.

## Stage 3 — core item/replication runtime

**Status:** `COMPLETE_2026_09_21`

Closed deliverables:

- Tinker's Magic has a real Intelligence-modifier resource (minimum one), server-authoritative spend and real Cheburashka temporary-item creation;
- 26 eligible mundane item identities are Chasovoy definitions; Tinker's Magic creations carry creator/source provenance and expire automatically on the creator's next Long Rest even after transfer;
- Replicate Magic Item known plans use one persistent Choice Runtime choice with exact 4/5/6/7/8 plan progression and one replacement on Artificer level gain;
- explicit 2/6/10/14 plan tiers are installed as Chasovoy item-plan identities, while Common / Uncommon Wondrous / Rare Wondrous catch-all eligibility is generic definition metadata rather than hard-coded class JSON;
- active replicated-item capacity is exact 2/3/4/5/6 at levels 2/6/10/14/18;
- Long-Rest reconciliation is assigned-player-only, generation-locked, validates known plans server-side, preserves existing instances, creates missing real instances and removes the oldest instance when capacity is exceeded;
- replacing a known plan, lowering below its tier or removing the assignment immediately cleans up affected replicated instances; container contents are detached safely before a created container vanishes;
- generic Cheburashka attunement state, capacity enforcement, transfer reset and CE projection gating now exist for any item definition that declares attunement;
- no Artificer inventory table or parallel item owner was introduced.

Runtime revision:
`efota-2025-artificer-stage3-item-replication-v1`.

The delayed owner-death rule is recorded on replicated item lifecycle provenance as
`expire_after_1d4_days_via_tobik_or_gm`; execution of that delayed random timer is
intentionally deferred until the shared TOBIK/death-event bridge exists rather than
using database randomness behind the roll engine.

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
