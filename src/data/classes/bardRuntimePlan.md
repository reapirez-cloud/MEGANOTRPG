# Bard runtime plan

> Internal implementation note. Keep this file beside the Bard reference sources so future class work does not mistake literary completeness for runtime completeness.

## Current boundary

**Stage 5: SUBCLASS RUNTIME READY.**

The canonical `class:bard` foundation, Bardic Inspiration, spell runtime, remaining base mechanics and the approved subclass runtime are deployed to production. The player-facing Bard reference remains `referenceOnly` until Stage 6 final certification is complete.

Production revision: `xphb-2024-bard-stage5-subclasses-runtime-v1`.

Stage 5 now owns nine runtime-backed colleges:

- PHB 2024: College of Dance, College of Glamour, College of Lore, College of Valor;
- approved official legacy/supplement: College of Eloquence, College of Swords, College of Whispers, College of Creation, College of Spirits.

College of Tragedy remains explicit reference-only third-party/partner material and has no active builtin runtime template.

Runtime guarantees now include:

- every subclass is a child of the active `class:bard` template, unlocks at Bard 3 and resolves mechanics from parent Bard level rather than total character level or a stale subclass level;
- every subclass ability that actually spends base Bardic Inspiration references the single canonical `bardic_inspiration` resource;
- subclass-owned finite pools use the shared persistent resource ledger with explicit Short/Long Rest recovery;
- Glamour, Lore and Spirits spell accesses use the canonical spell catalog and shared slot runtime;
- Lore Magical Discoveries and Spirits Spirit Session use shared Choice Runtime instead of bespoke subclass pickers;
- Spirit Session uses the generic `long_rest` refresh path; the client choice card was corrected so all declared rest refresh policies route through the authoritative rest-choice RPC;
- scene, hit, turn and initiative triggers remain exact structured/table-adjudicated rules rather than fake persistent state;
- every runtime action has a matching player-facing feature explanation under the same stable `sourceKey`; the migration self-certifies this invariant before commit.

Production migration: `bard_subclasses_stage5_v1` (journal `20260911133259`).

The production post-deploy smoke verified parent-level gating (Bard 2 blocks the subclass, Bard 3 activates it), the canonical Bardic Inspiration ledger, and creation of Glamour's real `bard_glamour_beguiling_magic` resource on subclass assignment. All probes were rolled back. Final pre-documentation Stage 5 code CI passed build, lint and `981/981` tests. Supabase advisors reported no Bard/Stage5-specific findings.

Next implementation target: **Stage 6 — final certification**.

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
