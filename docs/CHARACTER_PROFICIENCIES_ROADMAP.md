# Character Proficiencies — implementation roadmap

Status owner: UI v1 character sheet  
Target surface: `src/ui-v1-isolated/CharacterView.tsx`  
Reference rule: copy composition, geometry, hierarchy and ordinary behaviour; keep MegANOT palette, glass, typography, media system, Character Engine and Snake.

## Product contract

The screen is five panels in a stable order:

1. Оружие
2. Доспехи
3. Инструменты
4. Языки
5. Спасброски

The reference owns panel proportions, icon/title/counter/chevron placement, description placement and tag wrapping. MegANOT owns the visual skin.

## Stage 1 — data contract and read-model — READY

Implemented:

- `characterProficienciesCatalog.ts`
- `characterProficienciesReadModel.ts`
- CE-first ownership
- legacy fallback for `character_sheets.proficiencies`, `languages`, `saving_throw_proficiencies`
- deduplication
- provenance
- explicit unclassified runtime/legacy diagnostics
- trustworthy denominators only for closed catalogs
- unit coverage in `characterProficienciesReadModel.test.ts`

## Stage 2 — reference panel renderer — READY

Implemented:

- `CharacterSheetProficiencies.tsx`
- `character-sheet-proficiencies.css`
- mounted in `CharacterView` instead of `SectionPlaceholder`
- five read-model groups rendered through one stable panel anatomy
- large thematic icon column
- title + short description
- right counter + chevron zone
- wrapped tags
- dynamic panel height from content
- MegANOT premium glass and existing class palette only
- narrow-mobile geometry

Deliberate boundary: Stage 2 panels are statically expanded. No accordion state or Snake actions are added here.

## Stage 3 — behaviour and states — READY

Implemented:

- independent expanded/collapsed state per panel
- all five panels start expanded, matching the Stage 2/reference composition
- whole panel header is the tap target, including the chevron zone
- `aria-expanded`, `aria-controls`, labelled regions and collapsed `aria-hidden`
- short grid-row animation without fixed-height clipping
- reduced-motion fallback
- closed catalogs show `current / total`; open catalogs show the trustworthy current count only
- distinct loading, runtime error, stale-warning and empty-group states
- the real `.u1-character-sheet` scroll container is compensated while toggling

The abilities screen rule of “only one group open” is intentionally not used here. Each proficiency panel owns its own state.

## Stage 4 — canonical data integration — READY

Implemented and audited end-to-end:

- class grants
- subclass grants
- race/subrace grants through the generic template resolver
- background-feature mechanics
- feat mechanics
- effect mechanics
- persistent template choices
- parser → CE → resolved contract → proficiencies read-model

Historical key aliases are canonicalized only when emitted into Character Engine. Persistent option ids remain unchanged so existing `selected_choices` and Choice Runtime v2 receipts stay valid.

Grant Engine now preserves proficiency labels while still resolving the maximum rank. Known `skill:*` proficiency grants remain canonical CE data but are intentionally excluded from these five panels without creating false diagnostics.

Legacy sheet fields remain fallback only. They never replace a CE-owned row.

Detailed audit: `docs/CHARACTER_PROFICIENCIES_STAGE4_AUDIT.md`.

## Stage 5 — class coverage and future-mechanics placeholders — READY

Machine-readable coverage now reserves all 13 class identities in
`characterProficiencyClassCoverage.ts`.

Certified five-panel proficiency packages:

- Fighter
- Cleric
- Druid
- Wizard
- Bard
- Monk
- Paladin
- Sorcerer
- Warlock

Explicit `mechanics_pending` placeholders:

- Rogue
- Barbarian
- Ranger
- Artificer

Live audit found that Monk and Warlock had exact proficiency data already authored in `rules_meta.core_traits`, but their base CE grants were missing. Stage 5 adds forward-only, idempotent migrations for those two classes and installs the same repair for future campaigns.

This stage does not invent grants for pending classes, rewrite persistent choices, or change whole-class Mechanics READY status.

Connected Supabase was migrated and re-audited on 2026-09-19: all nine certified class baselines are present, no expected grants are missing, and active class/subclass proficiency grants have stable source identities.

Deployment/certification details: `docs/CHARACTER_PROFICIENCIES_STAGE5_AUDIT.md`.

## Stage 6 — Snake and authority — READY

Implemented through the existing universal Snake runtime:

- ordinary panel tap remains the Stage 3 accordion
- long press / right click on a proficiency tag opens Snake near the invocation point
- player actions expose proficiency and provenance inspection only
- GM/Admin authority comes from `control.canManage`
- CE-owned sources expose granular suppress / re-enable actions where safe
- mutation reuses `runtime.templates.suppressions.setSuppressed` and the existing Oracle → Shapoklyak canonical persistence path
- fully suppressed proficiencies remain visible as muted tags but no longer count as effective ownership
- legacy fallback cannot resurrect a suppressed CE-owned proficiency
- inherited parent suppression is shown but cannot be unsafely reversed from a child proficiency

No permanent management buttons were added to the reference composition and no new Supabase table/RPC was created.

Detailed audit: `docs/CHARACTER_PROFICIENCIES_STAGE6_AUDIT.md`.

## Stage 7 — visual/mobile certification

- unit tests for classification, fallback and provenance
- component/source contract tests
- GM/Admin/Player cases
- legacy and CE-native characters
- empty categories
- large tool/language lists
- narrow mobile widths
- visual regression fixture/screenshot
- cleanup of obsolete placeholder copy

## Non-goals

- no second proficiency database
- no direct UI-owned game rules
- no hardcoded fake counters
- no new Supabase table for this screen
- no redesign of legacy `CharacterProfileV2 / ResolvedCharacterSheetOpus`
