# Warlock authoring/runtime boundary plan — 2026-09-07

Developer-only checkpoint. This file is not runtime data and must never be rendered in player UI.

## Stage 1 — source-of-truth sync

**Status:** `READY_2026_09_07`

The Warlock reference layer, runtime ledger and deployed Supabase state use one declared boundary instead of treating the entire class as presentation-only.

## Certified runtime scope after Stage 2

### Base Warlock

- Catalog identity: `class:warlock`.
- Rules family: Player's Handbook 2024.
- Production base revision: `xphb-2024-warlock-ui-qa-v1`.
- Production level rows: 20.
- Pact Magic, the declared 2024 base progression and all 28 supported Eldritch Invocations are runtime-backed.
- The player-facing base class is runtime-backed and must not use `referenceOnly`.

### PHB 2024 patrons

The four previously certified patrons remain runtime-backed:

1. `archfey` — Архифея.
2. `celestial` — Небожитель.
3. `fiend` — Исчадие.
4. `great-old-one` — Великий Древний.

Runtime revision: `xphb-2024-warlock-subclasses-runtime-v1`.

### Stage 2 supplemental patrons

**Status:** `READY_2026_09_07`

The selected official supplemental runtime scope is now implemented, regression-gated and deployed to production:

1. `hexblade` — Клинок-проклятие.
2. `fathomless` — Бездонный.
3. `genie` — Джинн.
4. `undead` — Нежить.
5. `undying` — Бессмертный.

Runtime revision: `warlock-supplemental-runtime-v1`.

Each supplemental patron unlocks at Warlock level 3 and has production runtime rows at levels `3, 5, 6, 7, 9, 10, 14`.

The Stage 2 package is installed by:

- `20260907102000_warlock_supplemental_subclasses_runtime_v1.sql`
- `20260907102500_warlock_supplemental_stage2_completion_v1.sql`

Regression contract: `tests/warlockSupplementalSubclassesRuntime.test.ts`.

Production verification on 2026-09-07 confirmed all five templates active/builtin with `mechanics_status=READY`, `runtime_scope=WARLOCK_SUPPLEMENTAL_5`, the expected seven level rows, the Genie patron-kind choice, and no fake CE resource for randomized `1d4 Long Rests` cooldowns.

The class now has **9 runtime-backed patrons total**: four PHB 2024 patrons plus five supplemental patrons.

## Expanded / UA literary material

The following identities remain literary/reference material only and are not part of the supported runtime roster:

- `raven-queen`
- `seeker`
- `great-wyrm`

Do not promote these identities merely because a translated card exists.

## Player-facing reference contract

- Base Warlock: runtime-backed.
- Archfey / Celestial / Fiend / Great Old One: runtime-backed.
- Hexblade / Fathomless / Genie / Undead / Undying: runtime-backed as of Stage 2.
- Raven Queen / Seeker / Great Wyrm: expanded/UA literary-only until an explicit source and support decision.
- A reference card must never be interpreted as proof of runtime support without the matching deployed `rule_template` package.

## Stage 2 closure record

Stage 2 is closed. The production deployment caught and fixed a PostgreSQL parse error in the Hexblade Curse migration payload that static SQL-balance tests had missed. The corrected production-safe migration was re-run successfully, followed by the Stage 2 completion migration. CI run `#1848` and both Vercel checks passed after the fix.

Supabase security/performance advisors were re-run after deployment. They continue to report pre-existing project-wide debt, but no new Stage-2-specific supplemental Warlock warning was introduced.

## Remaining Warlock closure plan

### Stage 3 — end-to-end 1–20 character run

Exercise creation, level progression, Pact Magic, invocations, all supported patron features, resources, rest recovery, persistence and reload behavior across the nine-patron runtime roster.

### Stage 4 — final READY certification

Reconcile GitHub and production Supabase, run the complete Warlock regression/build/lint gates, update the canonical class ledger and only then promote overall Warlock mechanics/runtime from `IN_PROGRESS` to `READY`.

## Boundary rule

`WARLOCK_STAGE5_CERTIFICATION.md` remains authoritative for the four PHB 2024 patrons. Stage 2 closes the five-patron supplemental runtime scope. Overall Warlock mechanics remains `IN_PROGRESS` only because the end-to-end Stage 3 run and final Stage 4 certification are still pending; supplemental patron runtime is no longer a blocker.
