# INTERNAL: Warlock Stage 5 certification

> Developer/agent checkpoint only. This file certifies the PHB 2024 Stage 5 patron runtime scope. It does **not** promote the overall Warlock class ledger to `READY`, because supplemental authored patrons remain outside runtime scope.

## Status

- `stage: 5`
- `scope: PHB_2024_PATRONS`
- `status: READY`
- `certified_at: 2026-09-07`
- `runtime_revision: xphb-2024-warlock-subclasses-runtime-v1`
- `parent: class:warlock`
- `unlock_level: 3`
- `patrons: archfey, celestial, fiend, great-old-one`
- `runtime_rows_per_patron: 3,5,6,7,9,10,14`
- `regressions: tests/warlockPhb2024SubclassesRuntime.test.ts; tests/warlockStage5SqlSyntaxBalance.test.ts`
- `production_supabase: DEPLOYED_AND_AUDITED_2026_09_07`
- `vercel_preview: SUCCESS_BOTH_PROJECT_CHECKS_2026_09_07`

## Production audit

The production Supabase campaign was inspected after applying `warlock_phb2024_subclasses_runtime_v1`.

- Exactly four builtin patron templates exist at revision `xphb-2024-warlock-subclasses-runtime-v1`.
- Every patron points to the active builtin `class:warlock` parent and unlocks at Warlock level 3.
- Every patron has exactly seven runtime rows at levels `3, 5, 6, 7, 9, 10, 14`.
- Parent metadata records `subclass_runtime_included=true`, `subclass_runtime_count=4`, `subclass_runtime_scope=PHB_2024_4`, and the Stage 5 runtime revision.
- The campaign-install trigger and private Stage 5 installer/helper functions are present.

## Patron spell contract

Patron spell access is always prepared and uses the shared Warlock Pact Magic contract. Levelled patron spells spend `warlock_pact_slots` at the current Pact Magic cast level.

`Hunger of Hadar` was missing from the production spell catalog during the Stage 5 audit. Stage 5 therefore includes a separate forward catalog prerequisite that seeds the canonical spell identity and Warlock class link without inventing eager turn-state automation. The live Great Old One level-5 package was then verified to expose `spell:hunger-of-hadar` as `always_prepared`, `pact_magic`, cast at level 3, with `warlock_pact_slots` as the cost ledger.

## Key runtime checks

- Archfey: the separate free `Misty Step` access uses the `warlock_archfey_steps_of_the_fey` finite resource.
- Celestial: Healing Light exposes five resource-backed action variants.
- Fiend: Fiendish Resilience exposes 12 damage-type choices and refreshes after Short or Long Rest through the shared choice runtime.
- Archfey, Fiend, and Great Old One: all three pact-slot restore actions consume the canonical `warlock_pact_slots` ledger.
- Scene, target, hit, reaction, and per-turn legality remains structured GM adjudication where the application has no authoritative scene/turn state. Stage 5 does not create fake counters for those facts.

## Quality gates

GitHub Actions run `#1817` passed build, lint, and the complete test suite after the SQL-balance regression caught and removed two extra closing parentheses in the Stage 5 migration.

Supabase security and performance advisors were re-run after deployment. They reported existing project-wide security/performance debt, but no Stage 5-specific table, policy, index, or public RPC warning. Stage 5 installer functions remain in the private schema.

Both Vercel project checks succeeded on the certified Stage 5 head. Earlier pre-certification checks briefly hit the Hobby build-rate limit, but the final preview builds completed successfully and therefore do not block Stage 5 closure.

## Remaining Warlock scope

Overall `class:warlock` mechanics remain `IN_PROGRESS` beyond Stage 5. The following authored/queued supplemental patron work is not certified by this file: Hexblade, Fathomless, Genie, Undead, and queued Undying.
