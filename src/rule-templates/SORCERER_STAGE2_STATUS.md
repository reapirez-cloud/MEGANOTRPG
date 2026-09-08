# Sorcerer Stage 2 checkpoint

This branch-local checkpoint is folded into `CLASS_WORK_STATUS.md` before merge.

- Stage 1 foundation: READY, merged to `dev` in PR #60 on 2026-09-08.
- Mechanics/runtime overall: IN_PROGRESS.
- Stage 2 resource runtime: READY_FOR_VERIFICATION.
- Canonical persistent resources: `innate_sorcery`, `sorcery_points`, `sorcerous_restoration`.
- `sorcery_points` maximum equals Sorcerer class level from level 2 onward.
- Long Rest fully restores Sorcery Points and Innate Sorcery; Long Rest also refreshes the one-use Sorcerous Restoration gate.
- Sorcerous Restoration restores floor(Sorcerer level / 2) Sorcery Points after a Short Rest, once per Long Rest.
- Persistent resource state lives in `character_resource_states`; assignment-level sync preserves spent deficit on level changes.
- Font of Magic slot conversion: PENDING_STAGE3.
- Metamagic runtime: PENDING.
- Spell runtime: PENDING.
- Subclass runtime: PENDING.
