# Warlock READY plan — Stage 3 end-to-end certification

**Status:** `READY_2026_09_07`

This is Stage 3 of the current four-stage Warlock readiness plan. It is separate from the historical `WARLOCK_STAGE5_CERTIFICATION.md`, which certifies the PHB 2024 patron package.

## Scope

Stage 3 closes the end-to-end 1–20 runtime exercise for the current supported Warlock roster:

- base `class:warlock`;
- PHB 2024 patrons: Archfey, Celestial, Fiend, Great Old One;
- supplemental patrons: Hexblade, Fathomless, Genie, Undead, Undying.

Expanded/UA literary cards Raven Queen, Seeker and Great Wyrm remain reference-only and are not part of the runtime claim.

## Production reconciliation

Production Supabase verification on 2026-09-07 confirmed:

- `class:warlock` is active/builtin and has runtime rows for every level `1..20`;
- all nine supported patron templates are active/builtin;
- every supported patron unlocks at Warlock level 3;
- every patron has runtime rows at `3, 5, 6, 7, 9, 10, 14`;
- PHB patron revision is `xphb-2024-warlock-subclasses-runtime-v1`;
- supplemental patron revision is `warlock-supplemental-runtime-v1`.

## Transactional live E2E

A production-safe RPC exercise was run under a real campaign manager authorization context inside a deliberately rolled-back PL/pgSQL subtransaction. The temporary NPC never persisted after the check.

Passed invariants:

1. Character creation RPC succeeded.
2. Warlock assignment/update succeeded at milestone levels `1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20` (12/12).
3. Subclass assignment succeeded at level 3.
4. Subclass assignment level followed the parent class through level 20.
5. All nine supported patrons could be assigned through the public template-assignment runtime (9/9).
6. Persistent `warlock_pact_slots` ledger survived spend and restored to full on Short Rest.
7. Pact slots restored to full on Long Rest.
8. `warlock_mystic_arcanum_6` remained spent through the Short Rest path and restored on Long Rest.
9. The complete test fixture was rolled back after assertions.

Result summary: `milestones=12`, `patrons=9`, `subclass_follows_level=true`, `pact_short_rest=true`, `pact_long_rest=true`, `arcanum_long_rest=true`, `rolled_back=true`.

## UI/runtime truth fix

Stage 3 found a player-facing mismatch: `src/data/classReference.ts` still used a four-patron PHB allow-list even though Stage 2 had deployed five additional runtime patrons.

The public reference layer now derives its supported patron IDs from the PHB and supplemental runtime catalog-key constants. The resulting contract is:

- runtime-backed: 9 patrons;
- reference-only: Raven Queen, Seeker, Great Wyrm;
- base Warlock: `referenceOnly=false`.

Regression: `tests/warlockReadyPlanStage3E2e.test.ts`.

## Existing regression coverage reused by Stage 3

Stage 3 intentionally builds on the already certified mechanics suites instead of duplicating them:

- `tests/warlockOfficialPack.test.ts` — base 1–20 Pact Magic and finite-resource mechanics;
- `tests/warlockInvocationsRuntime.test.ts` and closure tests — invocation gates, prerequisites and runtime effects;
- `tests/warlockPhb2024SubclassesRuntime.test.ts` — four PHB patrons;
- `tests/warlockSupplementalSubclassesRuntime.test.ts` — five supplemental patrons;
- `tests/warlockStage4ArcanumReplacementGroup.test.ts` — Mystic Arcanum replacement semantics;
- `tests/warlockStage4UiQa.test.ts` — structured player choices and UI gates.

## Remaining gate

Overall Warlock stays `IN_PROGRESS` until Stage 4 performs final repository/production reconciliation, complete test/build/lint/CI certification and canonical status-ledger promotion to `READY`.
