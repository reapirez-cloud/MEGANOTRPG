# Sorcerer Stage 2 work note

Temporary branch-local handoff note. Before merge, fold this entry into `docs/PATCH_LOG.md` and remove this file.

- 2026-09-08: Stage 1 Sorcerer foundation merged to `dev` through PR #60.
- 2026-09-08: Stage 2 adds persistent `innate_sorcery`, `sorcery_points`, and `sorcerous_restoration` CE resources.
- Sorcery Points scale with Sorcerer class level and recover on Long Rest.
- Sorcerous Restoration restores floor(Sorcerer level / 2) points after a Short Rest, once per Long Rest.
- Assignment sync preserves spent deficit across level changes and removes orphaned Sorcerer resource rows when the class is removed.
- Font of Magic slot conversion, Metamagic execution, spell runtime, and subclass runtime remain pending.
