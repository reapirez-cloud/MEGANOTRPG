# Warlock authoring/runtime boundary plan — 2026-09-07

Developer-only checkpoint. This file is not runtime data and must never be rendered in player UI.

## Overall status

**Four-stage READY plan:** `CLOSED_2026_09_07`  
**Text:** `READY`  
**Mechanics/runtime:** `READY`  
**Final certification:** `src/rule-templates/WARLOCK_READY_CERTIFICATION.md`

The supported runtime boundary is the base Warlock plus nine runtime-backed patrons. Raven Queen, Seeker and Great Wyrm remain literary/reference-only and are explicitly outside the supported runtime roster.

## Stage 1 — source-of-truth sync

**Status:** `READY_2026_09_07`

The Warlock reference layer, runtime ledger and deployed Supabase state use one declared boundary instead of treating the entire class as presentation-only. The player-facing runtime roster is derived from the same PHB and supplemental runtime catalog identities used by Character Engine integration.

## Stage 2 — supplemental patron runtime

**Status:** `READY_2026_09_07`

### Base Warlock

- Catalog identity: `class:warlock`.
- Rules family: Player's Handbook 2024.
- Production base revision: `xphb-2024-warlock-ui-qa-v1`.
- Pact Magic and the declared 2024 base progression are runtime-backed through levels 1–20.
- All 28 supported Eldritch Invocations are runtime-backed through Choice Runtime v2.

### PHB 2024 patrons

Runtime revision: `xphb-2024-warlock-subclasses-runtime-v1`.

1. `archfey` — Архифея.
2. `celestial` — Небожитель.
3. `fiend` — Исчадие.
4. `great-old-one` — Великий Древний.

### Supplemental patrons

Runtime revision: `warlock-supplemental-runtime-v1`.

1. `hexblade` — Клинок-проклятие.
2. `fathomless` — Бездонный.
3. `genie` — Джинн.
4. `undead` — Нежить.
5. `undying` — Бессмертный.

All five supplemental patrons unlock at Warlock level 3 and are regression-gated through `tests/warlockSupplementalSubclassesRuntime.test.ts`. Persistent resources are Character Engine state; scene, target, hit, reaction and other facts not owned by authoritative app state remain on the GM adjudication boundary.

The class has **9 runtime-backed patrons total**.

## Stage 3 — end-to-end 1–20 character run

**Status:** `READY_2026_09_07`

Stage 3 is closed by `WARLOCK_READY_PLAN_STAGE3_CERTIFICATION.md` and `tests/warlockReadyPlanStage3E2e.test.ts`.

Production-safe live verification passed:

- Warlock milestone assignments at levels `1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20`;
- subclass selection at level 3 and automatic parent-level following through level 20;
- assignment of all nine supported runtime patrons;
- persistent Pact Magic spend and Short/Long Rest recovery;
- Mystic Arcanum Long Rest recovery;
- cleanup of the temporary test character after assertions.

## Stage 4 — final READY certification

**Status:** `READY_2026_09_07`

Stage 4 closed the last known source-eligibility defect in supplemental expanded patron spells and completed production reconciliation.

Final migration: `20260907125000_warlock_ready_stage4_source_gated_spells.sql`.

The migration and shared runtime now enforce:

- generic `source_requirements_any` gates for source-dependent class choices;
- Hexblade expanded spells only while Hexblade is an active source;
- Genie subtype spells only while both Genie and the matching persistent patron kind are active;
- stale source-dependent choices become inert when the required source disappears;
- persisted choice validation at the database boundary;
- server-side source validation in Pact Magic casting and generic class-spell execution;
- six required legacy supplemental spell identities seeded into the canonical spell catalog.

Production verification confirmed:

- one active base Warlock template;
- nine active runtime patrons, all unlocking at Warlock level 3;
- five supplemental patrons marked with expanded-spell runtime metadata;
- zero duplicate active Warlock catalog keys;
- zero orphan Warlock subclasses;
- `Shield` correctly gated to Hexblade;
- `Sanctuary` correctly gated to Genie + Dao;
- source-gate function and validation trigger installed;
- six of six required supplemental spell seeds present;
- source-gate revision `warlock-ready-stage4-source-gated-spells-v1`.

GitHub Actions CI run `#1863` (`34132411173`) on commit `9ae81b7f189a69f9f1f8295c89af6dd36f2782b1` passed build, lint and the complete test suite after the final runtime/test fixes.

Supabase security and performance advisors were re-run after deployment. They still report pre-existing project-wide RLS/SECURITY DEFINER/index debt, but no Warlock-specific finding blocks this certification. The Warlock public gameplay RPC remains intentionally authenticated and performs character-operation authorization before mutating resources.

## Expanded / UA literary material

These identities remain literary/reference material only and are not part of the supported runtime roster:

- `raven-queen`
- `seeker`
- `great-wyrm`

A translated/reference card never implies runtime support without a matching deployed rule-template package.

## Player-facing reference contract

Runtime-backed:

- Base Warlock.
- Archfey / Celestial / Fiend / Great Old One.
- Hexblade / Fathomless / Genie / Undead / Undying.

Reference-only:

- Raven Queen / Seeker / Great Wyrm.

## Boundary rule

`WARLOCK_STAGE5_CERTIFICATION.md` remains the historical certification for the four PHB 2024 patrons. `WARLOCK_READY_PLAN_STAGE3_CERTIFICATION.md` records the 1–20 live run. `WARLOCK_READY_CERTIFICATION.md` is the final overall readiness record.

The supported Warlock class has no known class-specific implementation or deployment blockers in the declared nine-patron runtime scope. Overall Warlock mechanics/runtime is `READY`.
