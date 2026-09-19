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

## Stage 5 — class coverage and future-mechanics placeholders

This stage is intentionally separate from Stage 4.

Goal: certify every playable class against the five-panel screen.

For every class whose mechanics already exist:

- locate the best existing source mechanics
- normalize weapon / armor / tool / language / saving throw grants
- verify resolved CE output
- verify provenance and suppression identity
- record missing or ambiguous ownership instead of guessing

Current planned “mechanics pending” placeholders:

- Разбойник / Rogue
- Варвар / Barbarian
- Следопыт / Ranger
- Артифисер / Artificer

For these classes, reserve stable class identities and coverage entries, but do not invent grants. Their placeholder status must make later mechanics connection a data change, not a UI rewrite.

All other classes should be checked against the mechanics already authored in the project and connected where possible.

Exit criterion: every supported class has either certified canonical proficiency data or an explicit mechanics-pending placeholder.

## Stage 6 — Snake and authority

Normal tap remains panel behaviour.

Long press adds the MegANOT context layer:

- inspect provenance
- source details
- GM/Admin source controls where valid
- source-aware suppression

Do not add permanent admin buttons to the reference composition.

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
