# Character Proficiencies — Stage 7 final certification

Date: 2026-09-19  
Branch: dev

## Scope

Stage 7 freezes the production contract for the UI v1 Владения screen.

It does not add new game rules. It certifies that the Stage 1–6 data, interaction and authority layers remain visually usable on the supported mobile width family.

## Final visual contract

The screen keeps exactly five panels:

1. Оружие
2. Доспехи
3. Инструменты
4. Языки
5. Спасброски

The external reference remains a geometry/composition contract only. MegANOT keeps its class palette, glass, typography, sheet background and universal Snake interaction language.

## Mobile guardrails

The production stylesheet now explicitly guards:

- <=359 px
- 360–389 px
- 390–399 px
- 400–430 px

The root and every panel are width-bounded. Tags have max-width 100%, normal wrapping and `overflow-wrap:anywhere`, so long authored names cannot create horizontal page drift.

## Deterministic browser fixture

Added:

- `e2e-character-proficiencies-stage7.html`
- `src/e2e/character-proficiencies-stage7-main.tsx`
- `e2e/character-proficiencies-stage7.spec.ts`

The fixture intentionally contains:

- all five groups
- an empty closed-catalog group
- long tool/language catalogs
- a long weapon label
- a suppressed proficiency
- player and manager Snake modes

Browser checks cover 320 / 360 / 390 / 430 px, horizontal overflow, 390 px anatomy, tag wrapping, dynamic panel height, independent accordion state, suppressed-row visibility/counters and Player vs GM/Admin Snake authority.

The Playwright run also emits a deterministic 390 px PNG certification artifact named `proficiencies-stage7-390.png`.

## Production-copy cleanup

Visible implementation/debug wording was removed from loading/error/diagnostic states.

Unclassified runtime/legacy counts remain available as non-visual data attributes for diagnostics; they no longer inject developer language below the reference panel stack.

## Regression coverage inherited from earlier stages

The final suite retains:

- Stage 1 classification, dedup, legacy fallback and provenance
- Stage 2 renderer/anatomy contract
- Stage 3 accordion/counters/loading/empty/error
- Stage 4 parser → CE → resolved contract integration
- Stage 5 13-class coverage contract and pending placeholders
- Stage 6 Snake permissions, suppression visibility and canonical mutation path
- Stage 7 browser/mobile/visual certification

## Database

No Stage 7 Supabase migration is required.

Stage 7 is presentation/certification only. Canonical gameplay state remains owned by the existing Character Engine/runtime and suppression persistence introduced before this stage.
