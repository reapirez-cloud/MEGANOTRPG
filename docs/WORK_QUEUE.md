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

**Status:** SUBCLASS_REFERENCE_ALL_9_READY_BASE_HAS_2_LITERARY_GAPS  
**Marked:** 2026-09-12  
**Branch:** dev

Current checkpoint:
- Gemini literary copy for the base Rogue is preserved in `src/data/classes/rogueReferenceCurrent.ts`.
- Base Rogue 2024 mechanics were independently corrected and written as exact reference mechanics for later runtime work.
- Missing Gemini prose remains explicit only for `Точный прицел` (Steady Aim, level 3) and `Скользкий ум` (Slippery Mind, level 15); do not invent Voss narration for them during mechanics work.
- Rogue is published to the Reference Guide as `referenceOnly=true`; no Character Engine or Supabase runtime is claimed or installed by this translation pass.
- All nine supported subclass feature packs are now authored and overlaid into the public reference: Thief, Assassin, Arcane Trickster, Soulknife, Swashbuckler, Inquisitive, Mastermind, Scout and Phantom.
- Wave 3 is `src/data/classes/rogueSubclassReferenceWave3.ts`: Mastermind and Scout use exact Xanathar legacy rules; Phantom uses the Tasha’s Cauldron of Everything rules rather than later revised/UA semantics.
- Regression coverage explicitly rejects known bad source-copy claims: Master of Intrigue does not invent an Insight-vs-Deception detection rule; Scout Sudden Strike does not require every extra attack to target a different creature; Phantom Soul Tokens do not invent an Undead/Construct exclusion, spirit answers need not be truthful, Wails rolls half the Sneak Attack dice, and Tasha Death’s Friend grants its fallback token after Long Rest rather than on Initiative.

Next translation item: supply literary prose for base Rogue `Точный прицел` and `Скользкий ум`. After that the Rogue text/reference layer can be marked fully READY before runtime implementation starts.
