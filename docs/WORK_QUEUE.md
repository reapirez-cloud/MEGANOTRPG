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

**Status:** STAGE_1_COMPLETE_STAGE_2_NEXT  
**Marked:** 2026-09-12  
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

Next Rogue stage: **Stage 2 — clean class foundation and 1–20 progression**.
- Build the canonical `class:rogue` package, source-level progression, proficiencies, Expertise/Weapon Mastery choices, subclass unlock and structural feature identities through shared class/template infrastructure.
- Do not redo Stage 1 unless the user explicitly changes the source/version scope.

## Inventory / scene interaction follow-up

**Status:** APPROVED_PRODUCT_DIRECTION_DEFERRED_IMPLEMENTATION  
**Marked:** 2026-09-15  
**Branch:** dev

Canonical product contract: `docs/INVENTORY_PRODUCT_CONTRACT.md`.

Current checkpoint:
- Cheburashka Stages 1–4 are complete through nested holders.
- Spatial grid/carry placement, weight, scene surfaces and trade are future implementation; do not report them as complete from documentation alone.
- Inventory must keep a clean future integration point for scene/chat `accessible_surfaces`.

Linked chat/scene debt:
- build real game chats/scenes and participant membership;
- support moving characters between chats/scenes as they change scene/location;
- connect scenes to locations;
- let GM create a Surface block in chat, publish loot and grant access to all/selected characters;
- enforce server-authoritative "first successful take wins" synchronization for shared surface items;
- add a dedicated Trade block in chat for PC↔NPC and PC↔PC, with NPC side controlled by GM, scoped inventory visibility, wanted-item highlighting, trade thread, double acceptance on the same revision and atomic exchange.

Do not solve this debt by creating parallel inventory ownership or an abstract currency wallet.
