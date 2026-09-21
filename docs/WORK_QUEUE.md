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

**Status:** COMPLETE_ALL_7_STAGES_READY  
**Marked:** 2026-09-21  
**Branch:** dev

Canonical READY plan: `src/data/classes/rogueRuntimePlan.md`.

Current checkpoint:
- Pre-Stage-2 reuse audit is complete; its selective-reuse constraints remain part of the certified package history.
- Rogue Stage 7 is complete at `xphb-2024-rogue-runtime-final-v1`.
- Production has exactly one active builtin `class:rogue`, all 20 level rows and exactly nine supported READY subclasses.
- The frozen roster is Thief, Assassin, Arcane Trickster, Soulknife, Swashbuckler, Inquisitive, Mastermind, Scout and Phantom.
- Public Rogue/reference cards are runtime-backed; the literary layer remains intact.
- Expertise and Weapon Mastery persistence, Rogue-level subclass resolution, Soulknife resource spend/recovery/removal cleanup and Arcane Trickster shared spell casting passed live transactional smoke.
- Final CI run `35625289587` / job `106418485380` passed Build, Lint, complete repository tests, Storybook and Playwright smoke.
- Rogue is now `Text: READY` and `Mechanics/runtime: READY`.
- Do not reopen Stages 1–7 unless a frozen rules contract changes or a new supported subclass is intentionally added.

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
