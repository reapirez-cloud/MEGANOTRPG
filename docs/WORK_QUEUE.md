# Internal work queue

> Developer/agent checkpoint. Not player-facing content.

## Sorcerer follow-up

**Status:** DEFERRED_AFTER_BASE_STAGE_6  
**Marked:** 2026-09-10  
**Branch:** dev

Return to Sorcerer after the current all-class translation pass is complete.

Current checkpoint:
- Base Sorcerer Stages 1-6 are complete and deployed.
- Stage 6 spell runtime is already READY; do not redo it.
- Next intended Sorcerer work item is Stage 7: subclass runtime/integration.
- Before Stage 7, re-open `src/rule-templates/CLASS_WORK_STATUS.md` and the Sorcerer authoring/runtime sources, then verify live Supabase parity rather than trusting stale notes.

Resume trigger: `ALL_CLASS_TRANSLATIONS_COMPLETE`.

## Rogue READY work

**Status:** STAGE_2_COMPLETE_STAGE_3_NEXT  
**Marked:** 2026-09-21  
**Branch:** dev

Canonical READY plan: `src/data/classes/rogueRuntimePlan.md`.  
Stage 1 freeze matrix: `src/data/classes/rogueRuntimeFeatureMatrix.md`.

Current checkpoint:
- Base Rogue literary/reference layer is complete. `Точный прицел / Steady Aim` and `Скользкий ум / Slippery Mind` now have authored Voss prose; no supported Rogue card carries `TRANSLATION_MISSING`.
- Base Rogue 2024 and all nine supported subclass packs have independently audited exact neutral mechanics.
- All 61 supported base/subclass features have stable feature keys and an explicit runtime ownership mode in the Stage 1 matrix.
- Frozen roster: Thief, Assassin, Arcane Trickster, Soulknife, Swashbuckler, Inquisitive, Mastermind, Scout and Phantom.
- Source boundary remains: PHB 2024 base + Thief/Assassin/Arcane Trickster/Soulknife; Xanathar legacy Swashbuckler/Inquisitive/Mastermind/Scout; Tasha Phantom.
- Rogue remains `referenceOnly=true`; no CE/Supabase runtime is claimed yet.
- Pre-Stage-2 reuse audit is complete: `src/data/classes/rogueRuntimeReuseAudit.md`.
- Historical Rogue work is salvageable selectively: adapt the old structural skeleton and action shapes, but do not restore the retired builtin installer.
- Historical `rogue-scion-of-the-three` is explicitly outside the frozen supported roster.
- Current shared runtime already covers long-rest choice refresh/replacement, CE resources/actions, alternative costs, shared spell execution and new-chat CE routing.
- Stage 2's confirmed new generic prerequisite is a dynamic proficient-weapon choice provider for Weapon Mastery.

Stage 2 checkpoint:
- Canonical `class:rogue` is deployed at `xphb-2024-rogue-stage2-foundation-v1` with 20 source-level rows.
- Base proficiency/language/skill choices, Expertise and Weapon Mastery use the same shared Choice Runtime/CE architecture as other classes.
- Generic `weapon_proficiencies` provider is implemented in UI/read-model and server validation; Long Rest refresh validation uses the same provider boundary.
- Sneak Attack dice progression is resolved as deterministic Rogue-level data.
- No Rogue subclass runtime is active yet; the retired extra Scion package remains excluded.
- Rogue remains `referenceOnly=true` and overall mechanics are `IN_PROGRESS`.

Next Rogue stage: **Stage 3 — core Rogue gameplay runtime**.
- Implement Sneak Attack structured execution boundary, Cunning Action, Steady Aim, Cunning Strike, Improved Cunning Strike and Devious Strikes through shared mechanics.
- Do not redo Stage 1/2 unless their frozen contract actually changes.

## Inventory / scene interaction follow-up

**Status:** STAGES_1_4_COMPLETE_STAGE_5_NEXT  
**Marked:** 2026-09-15  
**Branch:** dev

Canonical product contract: `docs/INVENTORY_PRODUCT_CONTRACT.md`.  
Canonical implementation roadmap: `docs/INVENTORY_IMPLEMENTATION_PLAN.md`.

Current checkpoint:
- Stages 1–4 are complete.
- Stage 5 is next: physical item definition + authoring language.
- There are 12 stages total; 8 remain.
- Do not report spatial placement, weight, world stashes, shared Surfaces or Trade as implemented merely because the target is documented.
- The former anatomical carry idea is superseded. Final carry model is two permanent 1×1 hands + N generic external 1×1 carry cells + real individually-opened bag/container grids.
- Ordinary grid compatibility is geometry-first. Large items may simply not fit. Specialized restrictions/capacities exist only where useful, e.g. a quiver carrying up to 50 arrows.
- Most items are instances. Stacks are reserved for explicit homogeneous bulk resources such as currency, ammunition and suitable herbs/powders; `ingredient` alone never implies stackability.

Linked chat/scene work is now Stage 9 rather than an unowned side note:
- real game chats/scenes and participant membership;
- character movement between scenes/chats;
- location relationship;
- GM Surface block with selected/all-character access;
- server-authoritative first-successful-take wins;
- inventory integration for accessible surfaces.

Trade is Stage 10:
- dedicated PC↔NPC / PC↔PC block;
- NPC side controlled by GM;
- scoped inventory visibility;
- wanted-item highlighting;
- trade thread;
- same-revision double acceptance;
- atomic exchange.

Do not solve any stage with parallel inventory ownership, an abstract currency wallet, anatomical slot simulation or UI-only authority.
