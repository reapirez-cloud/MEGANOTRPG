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

## Rogue translation pass

**Status:** BASE_REFERENCE_READY_SUBCLASSES_AWAIT_TRANSLATION  
**Marked:** 2026-09-10  
**Branch:** dev

Current checkpoint:
- Gemini literary copy for the base Rogue is preserved in `src/data/classes/rogueReferenceCurrent.ts`.
- Base Rogue 2024 mechanics were independently corrected and written as exact reference mechanics for later runtime work.
- Missing Gemini prose is explicit for `Точный прицел` (Steady Aim, level 3) and `Скользкий ум` (Slippery Mind, level 15); do not invent Voss narration for them during mechanics work.
- Rogue is published to the Reference Guide as `referenceOnly=true`; no Character Engine or Supabase runtime is claimed or installed by this translation pass.
- Nine supported literary subclass identities are registered as reference-only summaries: Thief, Assassin, Arcane Trickster, Soulknife, Swashbuckler, Inquisitive, Mastermind, Scout and Phantom.
- Subclass feature mechanics/text must be authored from the actual subclass translations/source rules before any runtime integration.

Next translation item: Rogue subclass feature packs.
