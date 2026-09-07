# Warlock authoring/runtime boundary plan — 2026-09-07

Developer-only checkpoint. This file is not runtime data and must never be rendered in player UI.

## Stage 1 source-of-truth sync

**Status:** `READY_2026_09_07`

The Warlock reference layer, runtime ledger and deployed Supabase state now use one declared boundary instead of treating the entire class as presentation-only.

## Certified runtime scope

### Base Warlock

- Catalog identity: `class:warlock`.
- Rules family: Player's Handbook 2024.
- Production runtime revision: `xphb-2024-warlock-ui-qa-v1`.
- Production level rows: 20.
- Pact Magic, the declared 2024 base-class progression and all 28 supported Eldritch Invocations are runtime-backed through the existing Stage 2–4 packages.
- The player-facing class reference is therefore runtime-backed and must not use `referenceOnly`.

### PHB 2024 patrons

The following four patrons are runtime-backed, deployed and covered by `src/rule-templates/WARLOCK_STAGE5_CERTIFICATION.md`:

1. `archfey` — Архифея.
2. `celestial` — Небожитель.
3. `fiend` — Исчадие.
4. `great-old-one` — Великий Древний.

Runtime revision: `xphb-2024-warlock-subclasses-runtime-v1`.

Each production patron unlocks at Warlock level 3 and has runtime rows at levels `3, 5, 6, 7, 9, 10, 14`.

## Reference-only supplemental patrons

The literary/reference catalog is intentionally broader than the certified runtime catalog. These authored patrons remain presentation/reference material until their own runtime pass is completed:

- `hexblade`
- `fathomless`
- `genie`
- `undead`
- `undying`

Their presence in `classReference` is not evidence of a Chasovoy template, Character Engine contribution or production mechanic.

## Expanded / UA literary material

The following additional identities remain literary material only and are not part of the current supported runtime backlog unless a later source/scope decision explicitly promotes them:

- `raven-queen`
- `seeker`
- `great-wyrm`

Do not merge these identities into the PHB 2024 runtime set merely because a translated card exists.

## Player-facing reference contract

- Base Warlock: runtime-backed.
- Archfey / Celestial / Fiend / Great Old One: runtime-backed.
- Hexblade / Fathomless / Genie / Undead / Undying: reference-only until separately implemented and certified.
- Raven Queen / Seeker / Great Wyrm: expanded/UA literary-only until an explicit source and support decision.
- A reference card must never be interpreted as proof of runtime support without the matching certified `rule_template` package.

## Remaining Warlock closure plan

### Stage 2 — supplemental patron runtime

Implement and certify the chosen supported supplemental patrons without weakening the already certified PHB 2024 packages.

### Stage 3 — end-to-end 1–20 character run

Exercise creation, level progression, Pact Magic, invocations, patron features, resources, rest recovery, persistence and reload behavior across the supported runtime roster.

### Stage 4 — final READY certification

Reconcile GitHub and production Supabase, run the complete Warlock regression/build/lint gates, update the canonical class ledger and only then promote overall Warlock mechanics/runtime from `IN_PROGRESS` to `READY`.

## Boundary rule

`WARLOCK_STAGE5_CERTIFICATION.md` is authoritative for the already certified PHB 2024 patron runtime. Supplemental literary cards do not invalidate that certification, but they keep the overall Warlock class ledger `IN_PROGRESS` until the declared supported supplemental runtime scope is closed or explicitly excluded from the final support roster.
