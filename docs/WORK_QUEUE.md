# Internal work queue

> Developer/agent checkpoint. Not player-facing content.

## AI GM readiness debt

**Status:** ACTIVE_TEMPORARY_DEBT  
**Marked:** 2026-09-23  
**Branch:** dev

Persistent numbered stage counter: `docs/AI_GM_ROADMAP.md`.\n\nCanonical temporary code tracker: `src/ai/aiGmReadinessDebt.ts`.

Hard rule: every item in that file carries the marker **«УДАЛИТЬ ПРИ РЕЙДИ»** and must be deleted as soon as the implementation is actually READY. Do not preserve completed entries as historical TODOs. When the array becomes empty, delete the tracker file and this queue section.

The tracker currently owns the full AI-GM debt discussed for:
- campaign-level selectable main GM model;
- `AI` selector replacing `VI`;
- hard stop/resume on player roll requests;
- NPC rolls and canonical ability cards;
- narrator vs NPC dialogue identities and avatars;
- canonical NPC stats/abilities and text inventory;
- NPC/location persistent art generation plus requested item art;
- action/bonus-action/movement/text turn queue;
- game-time-aware long-term memory consolidation and ageing of archived facts;
- player-intent/world-authority firewall;
- Snake edit-and-resend / regenerate;
- GM short/long rest and dawn recovery;\n- short rest / long rest / dawn recovery controls for AI GM;
- GM-turn rollback/replay, undo and runtime status;\n- cooperative split-party scene routing and explicit PC→PC recipient/audience metadata.

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
**Marked:** 2026-09-22  
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

## Artificer runtime work

**Status:** STAGES_1_4_COMPLETE_STAGE_5_NEXT  
**Marked:** 2026-09-21  
**Branch:** dev

Canonical plan: `src/data/classes/artificerRuntimePlan.md`.  
Frozen feature matrix: `src/data/classes/artificerRuntimeFeatureMatrix.md`.  
Reuse audit: `src/data/classes/artificerRuntimeReuseAudit.md`.

Current checkpoint:
- Stages 1–4 are complete.
- Stage 1 source freeze/specification remains frozen.
- Canonical source is Eberron: Forge of the Artificer (2025).
- Frozen runtime roster is exactly Alchemist, Armorer, Artillerist, Battle Smith and Cartographer.
- The matrix contains 10 base + 33 subclass = 43 stable feature identities.
- The retired historical Reanimator subclass is explicitly outside the supported roster.
- Literary/Voss fields are intentionally blank; the user will add that translation layer later.
- Production now has exactly one active Artificer class, 20 level rows and 0 active Artificer subclasses.
- The stale 29-link spell state has been reconciled to 92 class spell links and 92 template spell links under revision `efota-2025-artificer-stage2-foundation-spellcasting-v1`.
- Tinker's Magic grants Mending outside the ordinary cantrip quota; shared spell slots, cantrip replacement and Long-Rest preparation use the common runtime.
- Generic Chasovoy `reference_item_plans` validation is installed for Stage 3.
- The Stage 7 certifier exists only as a fail-closed future gate; it does not make the class READY.
- Stage 3 is complete: Tinker's Magic creates real temporary Cheburashka instances with Long-Rest expiry; Replicate Magic Item uses persistent Chasovoy plan identities, exact plan/item progression, server-authoritative Long-Rest reconciliation, provenance cleanup and generic attunement.
- Stage 4 is complete: Magic Item Tinker, Flash of Genius, real attunement-cap progression, Spell-Storing Item, Advanced Artifice / Magical Guidance and Soul of Artifice are runtime-backed through shared owners.
- Stage 5 is next: Alchemist, Armorer and Artillerist.
- Do not restore the retired historical Artificer installer wholesale.

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
