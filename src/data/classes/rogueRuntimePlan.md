# Rogue runtime plan — 2026-09-12

> Internal implementation contract for taking Rogue from reference-only text to production `READY`.
> This file is not player-facing content. Future Rogue mechanics work must follow this plan unless the user explicitly changes the scope.

## Overall target

**Current text/reference:** all 9 subclass feature packs authored; base Rogue still has two explicit literary gaps (`Steady Aim / Точный прицел`, `Slippery Mind / Скользкий ум`).  
**Current mechanics/runtime:** `NOT_STARTED`.  
**Target:** base Rogue 1–20 plus all 9 supported subclasses implemented through the shared Chasovoy → Shapoklyak/GENA → Character Engine pipeline, deployed to the connected Supabase project, regression-gated and final-certified as `READY`.

Supported subclass roster:

1. Thief
2. Assassin
3. Arcane Trickster
4. Soulknife
5. Swashbuckler
6. Inquisitive
7. Mastermind
8. Scout
9. Phantom

Source boundary:

- base Rogue: Player's Handbook 2024;
- Thief, Assassin, Arcane Trickster, Soulknife: Player's Handbook 2024 rules;
- Swashbuckler, Inquisitive, Mastermind, Scout: legacy Xanathar rules retained exactly on the Rogue 2024 parent;
- Phantom: Tasha's Cauldron of Everything rules retained exactly on the Rogue 2024 parent.

Gemini/Voss prose is **literary input only**. It is never authoritative for mechanics. Every exact rule must be independently checked before it becomes executable runtime.

## Non-negotiable architecture rules

- No Rogue-specific resource table, choice engine, spell engine, turn tracker or combat simulator.
- Persistent character facts belong to Shapoklyak and use the existing shared ledgers/choice runtime.
- Reusable class/subclass definitions belong to Chasovoy/rule templates.
- Normal player execution goes through GENA/shared template actions; GM reality changes remain Oracle → owner.
- CE calculates from explicit state and contributions; CE never persists or performs I/O.
- Scene facts the app does not own remain GM-adjudicated: whether an attack qualifies for Sneak Attack, target proximity, Advantage/Disadvantage from the scene, reaction legality, current turn, hit confirmation, line of sight and similar transient facts.
- Do not invent `*_confirmed`, `*_available`, corpse-nearby, ally-nearby, first-round, target-mark or once-per-turn persistence merely to automate prose.
- If Rogue reveals a genuinely missing generic primitive, add that primitive generically first and regression-test it outside Rogue-specific branches.
- Do not set the public Rogue reference to runtime-backed and do not write overall `mechanics_status=READY` before Stage 7 certification.
- Each implementation stage requires: exact source audit → code/migration → targeted regression tests → full CI → database dry-run where SQL changes exist → live deployment/audit for that stage before it is called complete.
- `main` is untouched until the user explicitly requests promotion.

---

## Stage 1 — source freeze, literary closure and executable specification

**Status:** `NOT_STARTED`

Goal: freeze one trustworthy specification before executable work begins.

Required work:

- receive/add the missing Voss literary copy for:
  - Steady Aim / Точный прицел;
  - Slippery Mind / Скользкий ум;
- independently re-audit every base Rogue 2024 feature against the authoritative rules;
- re-audit all 9 subclass packs against their declared source versions;
- keep the already-locked Wave 3 corrections intact;
- produce one runtime feature matrix that classifies every rule as:
  - native CE grant/formula;
  - persistent choice;
  - persistent finite resource;
  - shared spell access/casting;
  - GENA executable action/resource mutation;
  - exact structured rule with GM-adjudicated scene trigger;
  - presentation-only/reference text;
- explicitly record every rule that needs a missing generic primitive before Stage 2 starts;
- confirm stable catalog keys, source keys, feature IDs, subclass IDs and source-level semantics.

Gate to close Stage 1:

- zero `TRANSLATION_MISSING` markers in the supported Rogue scope;
- base + 9 subclass reference tests green;
- every supported feature has exact mechanics and an assigned runtime mode;
- no unresolved source-version ambiguity remains.

Expected durable artifacts:

- `src/data/classes/rogueRuntimePlan.md` (this file, updated as stages close);
- a Rogue runtime/spec matrix beside the class sources if the feature classification is too large for this plan;
- updated `CLASS_WORK_STATUS.md`.

---

## Stage 2 — clean class foundation and 1–20 progression

**Status:** `NOT_STARTED`

Goal: create the canonical `class:rogue` package without pretending the class is already ready.

Implement through shared class/template infrastructure:

- exactly one builtin `class:rogue` identity;
- Rogue source level 1–20;
- hit die and base proficiencies;
- saving throw proficiencies;
- starting skill choices and Thieves' Tools/tool/language grants exactly as the frozen rules require;
- subclass unlock at Rogue level 3;
- ASI/feat hooks and Epic Boon hook using the same generic source path as other classes;
- correct Sneak Attack dice progression as deterministic class-level data;
- Expertise choice definitions using the shared persistent/dynamic option runtime;
- Weapon Mastery choices and their legal replacement cadence using shared choice infrastructure;
- all level-gated feature identities required by Stages 3–4;
- multiclass/source-level semantics: Rogue subclass progression must use parent Rogue level, never total character level.

Do not implement a Rogue-only UI selector. Any new option-provider or replacement policy must be generic.

Stage 2 tests must prove:

- low/mid/high Rogue levels resolve through parser → CE;
- source level remains Rogue level under a higher total character level;
- choices are server-validatable and persist/reopen only according to their real cadence;
- no executable subclass mechanics are accidentally installed yet;
- unfinished Rogue remains non-READY and cannot masquerade as a certified class.

Expected migration/revision naming:

- `rogue_stage2_foundation_v1`;
- revision similar to `xphb-2024-rogue-stage2-foundation-v1`.

---

## Stage 3 — core Rogue gameplay runtime

**Status:** `NOT_STARTED`

Goal: implement the defining Rogue mechanics before defensive/high-level cleanup.

Scope:

- Sneak Attack:
  - exact dice progression;
  - exact weapon/attack eligibility represented as structured rule data;
  - no fake target/ally/Advantage scene state;
  - once-per-turn legality stays GM-adjudicated unless the application later owns authoritative turn state;
- Expertise resolution from the Stage 2 persisted choices;
- Weapon Mastery contribution/access from the Stage 2 choices;
- Cunning Action;
- Steady Aim;
- Cunning Strike:
  - all level-5 options;
  - exact Sneak Attack dice sacrifice/cost;
  - save DC formula;
  - options exposed as structured executable/roll modifiers only where existing generic GENA/Tobik/CE primitives can truthfully represent them;
- Improved Cunning Strike:
  - exact multiple-option semantics and total dice cost;
- Devious Strikes:
  - all level-14 options and exact costs/effects;
- any generic Sneak-Attack-dice-cost or rider primitive required by these rules must be generic, not `if rogue`.

Important boundary:

The app may calculate Sneak Attack dice and present legal rule options, but it must not invent whether the current target satisfies Sneak Attack or whether an option is tactically legal when those scene facts are not canonical.

Stage 3 gate:

- targeted core-runtime tests green;
- parser → CE exposes correct Rogue actions/rules at levels 1, 3, 5, 11, 14 and 20;
- any finite/persistent state survives reload and level resync;
- no duplicate Rogue mechanic IDs or broken references;
- migration dry-run + production deployment/audit for the Stage 3 slice.

Expected revision:

- `xphb-2024-rogue-stage3-core-runtime-v1`.

---

## Stage 4 — remaining base class, recovery/state semantics and base certification

**Status:** `NOT_STARTED`

Goal: make the base Rogue complete from level 1 through 20 before any subclass is allowed to carry the class to `READY`.

Implement/audit:

- Uncanny Dodge;
- Evasion;
- Reliable Talent;
- Slippery Mind;
- Elusive;
- Stroke of Luck;
- every base proficiency/save/choice contribution omitted by earlier stages;
- ASI/Epic Boon integration markers and any generic project-wide debt clearly separated from Rogue-specific readiness;
- exact reaction/action/resource semantics:
  - persistent finite uses use the shared resource ledger;
  - non-resource reaction/turn legality stays GM-adjudicated;
  - no fake action-economy state;
- class presentation in the Class tab must come from the resolved CE/runtime contract, not a Rogue-only component branch.

Base certification must prove:

- one complete Rogue 1–20 runtime package;
- all base feature IDs resolve at the correct Rogue source levels;
- no broken resource, action, choice or formula references;
- assignment/level changes reconstruct the same state after reload;
- source-level behavior remains correct in multiclass-shaped test characters;
- public class reference is still `referenceOnly=true` until all subclasses and final Stage 7 pass.

Expected revision:

- `xphb-2024-rogue-stage4-base-runtime-v1`.

---

## Stage 5 — PHB 2024 subclass runtime

**Status:** `NOT_STARTED`

Goal: implement the four subclasses whose active rules are part of the 2024 Rogue family.

Runtime roster:

1. Thief
2. Assassin
3. Arcane Trickster
4. Soulknife

Requirements:

### Thief

- Fast Hands uses shared action/item primitives; do not create a second inventory executor.
- Second-Story Work uses native movement/jump contributions.
- Supreme Sneak/Cunning Strike interaction preserves the exact 2024 rule.
- Use Magic Device uses shared magic-item/spell access rules and does not bypass canonical item ownership.
- Thief's Reflexes preserves exact turn semantics without adding a Rogue-only turn tracker.

### Assassin

- exact initiative/first-round/poison/assassination semantics from the frozen 2024 reference;
- first-round or hit-dependent facts that the app does not own remain structured GM-adjudicated rules rather than persistent flags;
- tool/proficiency grants use native contributions.

### Arcane Trickster

- use the shared spell catalog, spell choice runtime, spell-slot ledger and class-spell access;
- exact Wizard-list/school/level eligibility from the frozen 2024 rules;
- spellcasting ability and progression must be source-level correct;
- Mage Hand and subclass riders use shared spell/action representation;
- no Arcane-Trickster-only spell engine.

### Soulknife

- Psionic Energy Dice use the shared persistent resource model with exact die/count progression and recovery;
- Psychic Blades are native CE attacks/access, not inventory items;
- Soul Blades, Psychic Veil and Rend Mind spend/recover the real shared resource;
- scene/hit/save legality remains on the normal adjudication boundary where appropriate.

Stage 5 gate:

- all four subclasses parent to `class:rogue`;
- unlock/progress from parent Rogue level;
- strict class/resource gates pass;
- no orphaned spell/resource/action identities;
- stage migration deployed and live-audited;
- all four remain publicly reference-only until Stage 7 final certification.

Expected revision:

- `xphb-2024-rogue-stage5-phb-subclasses-v1`.

---

## Stage 6 — legacy/supplement subclass runtime

**Status:** `NOT_STARTED`

Goal: implement the five supported non-PHB-2024 subclass packages without silently rewriting them into imaginary 2024 versions.

Runtime roster:

1. Swashbuckler — Xanathar legacy
2. Inquisitive — Xanathar legacy
3. Mastermind — Xanathar legacy
4. Scout — Xanathar legacy
5. Phantom — Tasha

Rules:

- keep the exact source rules already frozen in the literary/reference files;
- adapt only class progression/parent linkage needed to live on the Rogue 2024 package;
- never “modernize” a legacy feature unless there is an explicit approved project compatibility rule;
- persistent resources/choices use shared runtime;
- non-persistent scene analysis, targets, initiative windows, cover relationships and similar facts remain GM-adjudicated when the app does not own them.

Known regression locks that must survive runtime:

- Master of Intrigue does not invent an Insight-vs-Deception detection contest;
- Soul of Deceit truth-detection deception is optional, not forced;
- Scout Sudden Strike does not require the Bonus Action attack itself to choose another creature; only a second Sneak Attack in the same turn cannot hit the same target twice;
- Phantom Wails rolls half the Sneak Attack dice, rounded up;
- Phantom Soul Trinkets do not invent an Undead/Construct exclusion;
- queried Phantom spirits are not required to tell the truth;
- Tasha Death's Friend fallback token is created after Long Rest when none are held, not on Initiative.

Stage 6 gate:

- all 5 packages pass strict quality/resource/parser/CE tests;
- all use Rogue parent-level semantics;
- no subclass-specific engine forks;
- migration deployed and production roster audited as exactly 9 supported Rogue subclasses total.

Expected revision:

- `rogue-stage6-legacy-subclasses-v1`.

---

## Stage 7 — final fail-closed certification and public activation

**Status:** `NOT_STARTED`

Goal: only here may Rogue become `READY`.

Create a final certification migration/test suite that refuses to write `READY` unless all previous stages are present and coherent.

Certification must fail closed unless production has:

- exactly one active builtin `class:rogue`;
- exact level rows 1–20;
- complete base Stage 2–4 runtime;
- exactly 9 supported active child subclasses;
- all subclasses parented to Rogue and source-level correct;
- zero duplicate active Rogue catalog keys;
- zero orphan Rogue subclasses;
- zero broken resource references;
- zero broken action/effect references;
- zero broken choice definitions/options;
- zero invalid spell links/access for Arcane Trickster;
- correct Soulknife resource identities;
- correct Cunning Strike/Devious Strike structured contracts;
- all public reference cards backed by the same declared runtime roster;
- no Rogue-only UI mechanics truth in Sheet, Chat or GM panel;
- Class tab presentation derived from the shared resolved CE contract;
- player execution routed through shared GENA/template/spell/resource paths;
- production installer/certifier helpers permissioned consistently with the other certified class packages;
- fresh assignment/reload/level-change reconstruction verified;
- full build, lint and complete repository test suite green.

Final live smoke must include at minimum:

- Rogue progression at representative levels 1, 3, 5, 7, 11, 14, 17 and 20;
- subclass parent-level resolution on a character whose total level is higher than Rogue level;
- persistent Expertise and Weapon Mastery choices surviving reload/level changes;
- a persistent Soulknife resource spend/recovery;
- Arcane Trickster spell choice/cast access using the shared spell runtime;
- removal/reassignment cleanup with no orphan Rogue resource state.

Only after all checks pass:

- set base Rogue `mechanics_status=READY` / runtime ready metadata;
- set all 9 supported subclasses ready;
- switch the base Rogue and those 9 public reference cards from `referenceOnly=true` to runtime-backed;
- update `CLASS_WORK_STATUS.md` to `Text: READY`, `Mechanics/runtime: READY`;
- record final production revision, migration journal, CI run and smoke/audit results in this file;
- update the active patch journal.

Expected final revision:

- `xphb-2024-rogue-runtime-final-v1`.

---

## Completion rule

Rogue is **not READY** because a migration exists, because a card is translated, because a test for one feature passes, or because the class looks correct in UI.

Rogue becomes **READY only after Stage 7** proves GitHub runtime, Character Engine resolution, shared persistent state, public reference, migrations and connected production Supabase all describe the same base class plus the same nine supported subclasses.

Until then the canonical next unfinished stage is the first stage in this file whose status is not `COMPLETE`.
