# MEGANOTRPG patch log

This file is the canonical release journal for work accumulated on `dev` before promotion to `main`.

## Active patch

No unreleased changes.

## Released patches

### Patch — 2026-09-05-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `4c7db0499b1154efa7300e342403edfed3ccf630`
**Started:** 2026-09-05
**Released:** 2026-09-05
**Release identity:** `patch 2026-09-05-A / explicit main fast-forward release`

### Player-facing changes

- Fixed character-identity posting for the campaign owner/admin and every GM: managers can now speak as any visible living PC or NPC in every writable chat, including personal character rooms and GM-only rooms.
- Aligned the actor picker with server permissions. Managers see all visible living characters; ordinary players see only their assigned active living PC, so the UI no longer offers an actor the server will reject.
- Preserved private-character isolation: a private NPC or PC remains unavailable to another manager unless that manager already has legitimate character visibility.

### Runtime and security changes

- Replaced the legacy per-user chat actor binding requirement in the message identity trigger with the canonical `is_owner OR role = 'gm'` manager invariant.
- Kept room state authoritative: managers can write to open and GM-only rooms, while closed/read-only rooms remain immutable; players still need normal room write access.
- Audited the active UI gates, live chat/world RLS policies and current server functions for owner-vs-GM drift. Active manager policies use `private.can_manage_campaign`; creator-only GM workspaces and private characters retain their separate privacy rules.

### Tests / verification

- Added regression coverage for manager-wide visible character selection, active-PC-only player selection, private-character isolation and the non-callable identity trigger.
- Reproduced the owner, GM and player failures against the live database before the migration, then verified owner inactive-PC posting, GM NPC/other-PC posting, GM-only room posting and assigned-player posting after deployment. Cross-character player posting and another GM's private NPC remain denied; all probes were rolled back.
- Full test suite passes (`712/712`), the production TypeScript/Vite build succeeds, and lint completes with only the existing warnings.

### Patch — 2026-09-04-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `a5ca15916329620575af435a701def44c27dd55b`
**Started:** 2026-09-04
**Released:** 2026-09-05
**Release identity:** `patch 2026-09-04-B / explicit main fast-forward release`

### Player-facing changes

- Fixed zone creation and editing for every campaign GM and the owner/admin, including GM-only zones created by another manager.
- Kept players read-only: they still cannot create, edit, archive or delete zones and only see locations allowed by normal visibility/discovery rules.

### Runtime and security changes

- Corrected the world visibility contract so `private` locations and links mean “GM-only” instead of “creator-only”.
- Made the manager branch of the `locations` SELECT policy row-local so Supabase `INSERT ... RETURNING id` can return a newly created zone without weakening player RLS.
- Preserved Larisa ownership and the existing `GM Cabinet → Oracle → Larisa` mutation path; no React-to-table write bypass was added.

### Tests / verification

- Added regression coverage for manager-wide private-zone visibility, player discovery-only visibility, manager-only private links and non-exposed helper grants.
- Reproduced the original RLS failure against the live database, then verified both current GM accounts can create GM-only zones and the second GM can edit the first GM's zone; a player probe remains denied. All probes were rolled back.
- Full test suite passes (`698/698`), the production TypeScript/Vite build succeeds, and lint completes with only the existing warnings.

### Patch — 2026-09-04-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `2f925706941493dc34611fe92e850c9607cbbcd1`
**Started:** 2026-09-04
**Released:** 2026-09-04
**Release identity:** `patch 2026-09-04-A / explicit main fast-forward release`

### Player-facing changes

- Filled the reference-rule cards for the translated Bard, Monk, Paladin, Sorcerer and Warlock base classes and their complete currently authored subclass rosters.
- Added explicit reference-only cards for missing 2024 base-class features. These cards deliberately keep their English feature name and show a visible `Перевода способности пока нет` note instead of inventing Voss narration.
- Kept every rebuilt class marked `referenceOnly`: the new text is visible in the Reference Guide but does not grant character resources, actions, spells or other Character Engine mechanics.

### Runtime and architecture changes

- Added the final forward-only Wizard runtime closure after the subclass-v3 installer. Existing and newly created campaigns now retain the authoritative Wizard metadata, all 13 supported subclass packages and the established post-rest policy after installation order is resolved.
- Added the subclass-mechanics roadmap describing the shared CE/template pipeline, completion gate, source audit and implementation waves without activating any additional subclass runtime.

### Tests / verification

- Added a regression gate requiring every visible base/subclass feature in the five translated new-class families to have a non-empty mechanical rule.
- Updated the Bard reference test to distinguish exact reference text from runtime activation.
- Added Wizard closure regression coverage for installer ordering, shared class-quality/resource gates, parser output and representative CE resolution.
- Full test suite passes (`660/660`), production TypeScript/Vite build succeeds, and lint reports no errors.

### Known incomplete work

- Artificer, Barbarian, Ranger and Rogue do not yet have authored translation/reference source files in the current `dev` tree; they are not silently reconstructed from the retired vague legacy catalog.
- Runtime/Character Engine packages for the five reference-complete class families remain intentionally outside this patch.

### Patch — 2026-09-02-D

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `70596b402a9f37ce8295b174462381c8633badfd`
**Started:** 2026-09-02
**Released:** 2026-09-03
**Release identity:** `patch 2026-09-02-D / explicit main fast-forward release`

### Player-facing changes

- Restored the accepted layered Voss translation chain for Fighter: Brant is the active base voice and all four accepted Fighter Gemini subclass packs are once again resolved before the older fallback material.
- Restored the accepted Wizard literary chain: Johann/Kaspar is the active base-class narration and Wizard subclass Gemini packs 1–4 are applied in priority order before curated fallback text. The accepted Vitold / Bruno / Gorn pass from pack 2 is therefore active again; Order of Scribes remains an explicit literary debt rather than a mechanics blocker.
- Restored dedicated Fighter feature-level Voss comments in `ReferenceGuide`, so the UI no longer drops the separate post-rule comment layer for Fighter abilities.
- Removed the stale generic Monk card from the player-facing static class catalog. Monk literary authoring is complete around Brother Korn, but the class remains intentionally hidden until its independently authored mechanics/runtime package is ready instead of exposing obsolete fallback copy.
- Druid and Cleric were audited during the translation reconciliation and their active narration aggregators already matched the accepted `main` versions; no replacement was needed.
- Completed the declared Monk literary scope: Brother Korn base class, all ten declared WotC-scope subclass drafts, plus Cobalt Soul / Sister Valeria and Living Weapon / Brother Goran as optional source-review candidates.
- Preserved the complete Sorcerer literary authoring package: Luka base class, nine originally planned subclass identities and three extended candidates (Runechild, Phoenix Sorcery and Stone Sorcery), all still authoring-only.
- Expanded Warlock literary authoring to eight of nine planned patrons by adding Genie / Abdul and Undead / captain von Stein. The existing Nazar/Fathomless wave remains canonical rather than duplicating a second overlapping Fathomless draft.

### Runtime and rules changes

- No new Monk, Sorcerer or Warlock mechanics/runtime were activated. Their authoring drafts continue to keep `mechanics` empty and treat supplied exact-rule blocks, levels, spell lists and source labels as non-authoritative planning material.
- Fighter, Druid, Cleric and Wizard mechanics were not rewritten by the translation reconciliation; the change restores only which accepted literary layers the existing reference UI resolves.
- Removed the unfinished Monk static fallback from `classReference`; unfinished classes must not appear merely because prose exists while their canonical Chasovoy/CE runtime package is absent.

### Repository / release process

- Reconciled the previously diverged `main` and `dev` histories with a real two-parent merge commit (`0923c2dc42351698100da97d8f392e7adf808a7e`) instead of force-updating either branch. The merge preserved the current dev authoring work while restoring the accepted Fighter/Wizard translation files that existed only on the newer main line.
- PR #43 is closed/superseded by that explicit reconciliation merge.
- Added `src/data/classes/warlockSubclassReferenceDraftWave3.ts` for Genie and Undead under the same authoring-only boundary used by the earlier Warlock waves.
- Updated `warlockAuthoringPlan.md` to eight of nine planned patrons and recorded the duplicate-Fathomless policy.
- Reconciled `CLASS_WORK_STATUS.md`: Fighter/Wizard active translation wiring is recorded, Druid/Cleric equality is recorded, Monk is 10/10 plus two optional literary candidates, Sorcerer now has a dedicated 9+3 authoring checkpoint, and Warlock is 8/9 with only Undying left.

### Tests / verification added in this patch

- Verified the active Druid and Cleric aggregator blobs match between reconciled dev and the accepted main source.
- Verified Fighter now resolves Brant plus Gemini packs 1–4 and `ReferenceGuide` imports the dedicated Fighter base/feature comment getters.
- Verified Wizard now resolves the Johann base source and subclass Gemini packs 1–4 before fallback material.
- Verified Monk/Sorcerer/Warlock authoring drafts remain outside the active runtime/catalog path; the stale Monk catalog shell was removed rather than activating unverified rules.
- No new full CI/build-success claim is made for this authoring/translation reconciliation unless a current-head workflow reports it separately.

### Known incomplete work

- The repository still has 10 stale Voss/text-contract assertions inherited from the earlier narration releases and awaiting reconciliation with the authored text.
- Monk exact 2024/legacy rules, CE resources/actions/choices, package-quality tests and catalog/runtime activation remain intentionally pending a separate mechanics pass.
- Sorcerer exact rules, source eligibility for extended candidates, Sorcery Point/Metamagic runtime, CE integration and package tests remain intentionally pending a separate mechanics pass.
- Warlock exact rules, Pact Magic slot progression, Invocations/Pact options, patron spell packages, Mystic Arcanum, CE resources/actions and package tests remain intentionally pending a separate mechanics pass.
- One user-planned Warlock literary patron remains: Undying / Бессмертный.
- Wizard Order of Scribes remains accepted literary debt; the already-certified Wizard runtime package is not blocked by that prose debt.

---

### Patch — 2026-09-02-C

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `a37d9900c9a753c9c10bd7ca4f8c0d97f168e0ee`
**Started:** 2026-09-02
**Released:** 2026-09-02
**Release identity:** `main / 70596b402a9f37ce8295b174462381c8633badfd`

### Player-facing changes

- Rewrote the complete active Fighter Voss narration layer: the base class, all ten supported archetypes and every active archetype feature now use Voss's own soldier perspective instead of a generic grimdark observer.
- Fighter is now the profession Voss understands and respects most: strength comes from training, judgement, fear, repetition and responsibility rather than divine, innate or borrowed magic. The rewrite keeps that respect grim and costly rather than heroic or romantic.
- Each Fighter archetype now has its own axis instead of repeating efficient killing: Battle Master is closest to Voss's own battlefield trade; Cavalier is self-sacrificing protection; Champion is the horror of pure human conditioning; Banneret earns authority by leading from the front; Samurai is disciplined fear management; magical archetypes remain useful but inherit Voss's distrust of magic.
- Started Character Profile v5 Stage 1: one sticky Character Navigator now shows the character name and current section, then opens section selection through the standard action sheet.
- Removed the old persistent horizontal Sheet/Class/Magic/Items/Diary/Arts rail while preserving the same destinations and the existing conditional visibility of Magic.
- Removed redundant inventory browsing instruction copy from the character-profile presentation and calmed the profile shell toward the agreed dark editorial campaign-companion direction.
- Completed Character Profile v5 Stage 2 profile-content recomposition: Health is now the primary combat panel with resolved current/max HP and a quiet state bar, while AC, initiative, speed, proficiency and passive perception use an adaptive secondary-stat grid instead of five equal mini-cards.
- Reworked the ability/skill surface without changing its mechanics: the existing ability rail and related skills remain, tutorial swipe copy is gone, a quiet position indicator replaces it, and the layout adapts between narrow stacked and wider split compositions.
- Rebalanced the profile identity block: class and level are visible again beside the character identity, while Reference is a signed `Справочник` entry instead of an icon-only control.
- Simplified the sheet directory into concise section navigation without explanatory UI prose telling the player how to browse it.
- Completed Character Profile v5 Stage 3 shared Focus/Detail language: Resources, Actions, Feats, Defenses, Origin and Story now use one consistent focused-section shell with an explicit back/context/title/action hierarchy instead of six locally authored section headers.
- Character Engine calculation details now open in one shared character-detail bottom sheet with the resolved value and source provenance, while manager feature creation is promoted into the focused section header instead of sitting in a detached action row.
- Completed Character Profile v5 Stage 4 interaction foundation: Back now descends exactly one character-navigation level at a time — focused Sheet section → Sheet overview → top-level character exit — instead of unexpectedly leaving the character while the player is still inside a nested surface.
- The large character identity hero now collapses automatically on focused Sheet content and all non-Sheet sections, keeping only the portrait/name/status context needed while deeper content is being used.
- Loading, empty, error and stale-runtime feedback now share one character-profile state language instead of mixing unrelated `center-state`, `auth-error` and ad-hoc empty placeholders.
- Detail and action bottom sheets now share predictable dismissal behavior through explicit close, backdrop dismissal and Escape; art keeps the intended `tap → detail` and `long press → actions` split without tutorial copy explaining the gesture.
- Completed Character Profile v5 Stage 5 specialized-section recomposition for Class, Magic and Inventory so those major surfaces now use the same section-header, Focus and Detail language as the rebuilt Sheet instead of embedding their older standalone visual shells inside v5.
- Class is now a concise directory into focused Class, Subclass and Wizard «Моя книга» surfaces. The old `Все / Класс / Подкласс / Моя книга` segmented switch is removed while the existing Sheet deep-link bridge into class or subclass mechanics remains supported.
- Magic now opens with a compact v5 section header, keeps the resolved casting characteristic / save DC / attack values and shared spell-slot meter visible, and uses the common empty/error states plus the common Detail sheet for spell inspection instead of its previous bespoke spell detail surface.
- Inventory now uses focused category and equipment-slot drill-down rather than carrying every navigation level in one old shell. A tap opens the shared item Detail view, long press still opens contextual actions, and equip/unequip plus curse disclosure retain their existing behavior.
- The profile-level Back flow now recognizes internal Class and Inventory focus and returns to the specialized section overview before leaving that top-level character tab.
- Completed Character Profile v5 Stage 6 social/media recomposition for Diary and Arts. Diary now reads as a character chronology with a quiet timeline, authored-note composer, readable entry bodies and inset comment threads instead of another stack of dashboard cards.
- Diary image attachment, comment expansion, posting and long-press entry/comment actions keep their existing behavior while the presentation is reduced to the record, author, time and content that actually matter.
- The character gallery is now media-first: a responsive dense grid gives the newest/first art a larger visual slot, keeps titles directly on the media, and collapses to two columns on phone widths instead of presenting every image as an equal utility tile.
- Art still follows the shared interaction contract from Stage 4: tap opens the common Detail sheet, long press opens contextual actions, while captions and edit/delete controls remain available in Detail for authorized users.
- Completed Character Profile v5 Stage 7 editor migration: avatar, Sheet, Resources, Spell, Inventory, Feature, Diary-post and Art-metadata editors now share one dark editorial editor language instead of mixing several generations of bottom-sheet UI.
- Editor fields now use readable labels, consistent 44px-or-larger touch targets, clear focus-visible states and adaptive grids; long forms keep comfortable text areas instead of shrinking content into dashboard-sized controls.
- Flat editors now share the same sticky header/action hierarchy, while the existing multi-step Inventory and Feature creators keep their progressive workflow but adopt the same v5 surfaces, progress language and review hierarchy.
- Narrow-phone layouts collapse dense field groups without horizontal squeezing, preserve safe-area padding, and respect reduced-motion preferences.
- Completed Character Profile v5 Stage 8 final consolidation: the retired v4 sheet layer is gone, its active structural rules have been absorbed into v5, and the current profile no longer depends on `sheet-v4__*` hooks or `character-profile-v4.css`.
- Final polish increases label readability and preserves 44px interaction targets across the profile, while the phone combat hierarchy keeps three primary combat cards above two secondary metrics instead of collapsing them into an arbitrary equal grid.
- Very narrow screens still receive an explicit two-column fallback, while ordinary phone widths keep the intended combat hierarchy; hover-only feedback is now gated to pointer devices and reduced-motion behavior remains respected.
- Completed Character Profile v5 Stage 9 interaction/accessibility hardening: shared Detail and contextual Action bottom sheets now behave as real modal surfaces — keyboard focus stays inside them, Escape closes them, focus returns to the invoking control, and background document scrolling is locked while a sheet is open.
- Normalized the remaining small interaction controls to 44px-or-larger targets across stale/error actions, specialized Class/Magic/Inventory actions, Diary comments and social uploads, with visible focus treatment for keyboard users.
- Diary/gallery file inputs remain native and keyboard-focusable while visually hidden; upload labels now expose focus state instead of relying on mouse/touch-only `display:none` controls.

### Runtime and rules changes

- `src/data/classes/fighterVossNarration.ts` is now a self-contained canonical literary source rather than a one-line re-export of `fighterVossNarrationLegacy.ts`; the legacy file remains archival/reference material only.
- Preserved the existing Fighter narration export/getter contract used by `ReferenceGuide`; no Fighter mechanics, Character Engine contracts, resources, action economy or exact-rule text were changed.
- Added an explicit Fighter authoring contract preventing future passes from collapsing every feature into another variation of «he kills efficiently»; feature narration must instead vary across positioning, endurance, command, observation, fear, recovery, discipline and the cost of survival.
- Added `src/character-profile-v5.css` as a scoped semantic migration layer for character-profile surfaces, text, accents, spacing, radii, motion and icon sizing; it is loaded after the existing profile/module CSS so v5 can deliberately supersede older presentation without replacing runtime ownership.
- Character Profile v5 Stages 1–9 remain presentation-only: the shared `useResolvedCharacterRuntime` path, Character Engine contract, Sheet/Class/Spells/Inventory runtime, persistence and canonical ownership remain unchanged.
- The Stage 2 HP bar is derived only from `ResolvedCharacterContract` current/max HP and creates no new stored health value, local mechanic or persistence source.
- Added reusable presentation primitives `CharacterFocusShell.tsx` and `CharacterDetailSheet.tsx`; neither component imports or owns Character Engine resolution, Supabase persistence, resources, gameplay state or domain-owner writes.
- `ResolvedCharacterSheetBase` still resolves calculation detail through `explainCharacter(input, explain.query)` and still renders actions, resources, features and capabilities from the same `ResolvedCharacterContract`; Stage 3 changes only how those resolved values are presented and navigated.
- Existing class/subclass focus bridge and the runtime ownership boundaries for Class, Spells and Inventory remain untouched so later specialized v5 passes can adopt the shared Focus/Detail language without creating parallel engines.
- Added `CharacterSectionState.tsx` as a presentation-only status primitive and `CharacterInteraction.css` as the Stage 4 interaction layer; neither owns character data, resources, persistence or gameplay resolution.
- Stage 4 Sheet focus reset uses only a React presentation remount key to return the nested Sheet renderer to its overview. It does not clear, rebuild, mutate or persist character state and does not introduce a second navigation or mechanics owner.
- Runtime errors with an already resolved snapshot are now presented explicitly as a stale last-known calculation while retry still delegates to the existing runtime refresh path; no fallback mechanic or guessed value is created.
- Added the presentation-only `CharacterSectionHeader.tsx` and `CharacterSpecialized.css` primitives for Stage 5. They own hierarchy and styling only and do not read or mutate domain persistence.
- Class still renders the existing `CharacterClassPanelBase` against the same `ResolvedCharacterContract`; Stage 5 only wraps class, subclass and Wizard book destinations in the shared v5 navigation language.
- Magic still derives casting math from `contract.spellcasting.byAbility`, spell slots from `contract.resources`, and character spell membership through the shared catalog/reference path; no local spell formula, slot pool or alternate spell authoring path was introduced.
- Inventory mutation still delegates through the existing equip/delete callbacks and owner runtime. Stage 5 adds no direct Supabase, Cheburashka or Oracle bypass from the presentation layer.
- The existing `meganotrpg.character-class-focus` bridge is preserved for Sheet → Class/Subclass deep links; the new focus/reset signaling is presentation navigation only and does not become a mechanics owner.
- Added `CharacterSocial.css` as the Stage 6 presentation layer for Diary and Gallery. It styles the existing profile markup and shared Detail component but owns no social/media records, character rules, persistence or permissions.
- Diary/gallery CRUD remains in the existing `useCharacterSheet` social/media adapter and uses the same established permission/RLS path; Stage 6 adds no alternate storage, Character Engine source, GENA action, Oracle command or character-mechanics state.
- Added `CharacterEditors.css` as the Stage 7 presentation layer. It scopes the existing editor families under Character Profile v5 tokens and changes no editor inputs, save/delete callbacks, permission gates, MechanicsBuilder state or persistence ownership.
- Sheet/Resources/Spell/Inventory/Feature editing continues to delegate through the existing `CharacterProfileV2` callbacks into `useCharacterSheet`; the editor migration adds no direct Supabase access and no Character Engine, GENA, Oracle, Cheburashka or Shapoklyak ownership path.
- Stage 8 removes the `character-profile-v4.css` import from `ResolvedCharacterSheetBase`, deletes the stylesheet itself, and replaces every active `sheet-v4__*` presentation hook with v5-owned structure. `character-profile-v3.css` remains intentionally as a compatibility foundation for still-emitted legacy class names, while v5 is the only active migration/design layer above it.
- Stage 8 changes no resolved values, resource state, class/spell/inventory ownership, persistence callback or gameplay command path.
- Added presentation-only `src/hooks/useDialogSurface.ts` as the shared modal-interaction primitive for Character Detail and Context Action sheets. It owns focus trapping/restoration, Escape dismissal and background-scroll locking only and has no Character Engine, persistence, GENA, Oracle, Cheburashka or Shapoklyak ownership.
- Stage 9 changes no resolved values, resources, spell/inventory state, persistence callbacks or owner commands; it only hardens modal/input interaction and accessible presentation.

### Repository / release process

- Promotion to `main` was explicitly authorized on 2026-09-02; this patch is closed for release.
- Promoted through PR #42 and merged to `main` as `70596b402a9f37ce8295b174462381c8633badfd`.

### Tests / verification added in this patch

- Verified the canonical Fighter file preserves `fighterClassVossNarration`, `fighterClassVossComment`, `getFighterBaseVossNarration`, `getFighterSubclassVossNarration`, `getFighterSubclassVossComment` and `getFighterSubclassFeatureVossNarration` signatures expected by the existing reference UI.
- This is a narration-only follow-up; no new full repository CI completion claim is made for this text pass.
- Character Profile Stage 1 CI run #1319: production TypeScript/Vite build succeeded and lint completed with 0 errors / 23 warnings. The repository test suite passed 599/609 tests; the 10 failures are stale pre-existing Voss/text-contract assertions from the earlier Fighter/Druid/Cleric narration rewrites, not failures in the Stage 1 profile code.
- Character Profile Stage 2 CI run #1322: production TypeScript/Vite build succeeded and lint completed with 0 errors / 21 warnings. The suite now contains 611 tests and passed 601/611; the same 10 stale Voss/text-contract assertions remain the only failures.
- Expanded `characterSheetHierarchy.test.ts` with v5 regression gates for Health-first hierarchy, CE-derived HP presentation without a second storage source, identity/Class/Reference composition, CSS cascade ordering and adaptive mobile layout. All Stage 2 hierarchy tests pass in CI #1322.
- Character Profile Stage 3 CI run #1329: production TypeScript/Vite build succeeded and lint completed with 0 errors / 21 warnings. The suite contains 616 tests and passed 606/616; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterFocusPattern.test.ts` with five regression gates for one reusable full-page Focus shell, one reusable Detail bottom sheet, all six deep Sheet sections adopting the shared shell, CE explanations retaining `explainCharacter` as their source, adaptive token-driven presentation and the manager feature-create action living in the focused header. All five Stage 3 tests pass in CI #1329.
- Updated the older Stage 2 hierarchy contract so it now requires the shared `CharacterFocusShell` and explicitly rejects the removed local `FocusHeader`; all existing v5 hierarchy tests continue to pass in CI #1329.
- Character Profile Stage 4 CI run #1338: production TypeScript/Vite build succeeded and lint completed with 0 errors / 21 warnings. The suite contains 622 tests and passed 612/622; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterInteractionPattern.test.ts` with six regression gates for one-level Back behavior, compact deep hero presentation, shared loading/empty/error/stale states, predictable Detail/Action dismissal, `tap → detail` plus `long press → actions` art behavior and the presentation-only runtime boundary. All six Stage 4 tests pass in CI #1338.
- Stage 2 and Stage 3 character-profile regression gates continue to pass under the Stage 4 interaction changes; Stage 4 introduced no new failing test family.
- Character Profile Stage 5 CI run #1351: production TypeScript/Vite build succeeded and lint completed with 0 errors / 22 warnings. The suite contains 628 tests and passed 618/628; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterSpecializedSections.test.ts` with six regression gates for the shared specialized header, Class directory/Focus hierarchy, CE-backed Magic values and slots, Inventory Focus/Detail behavior, profile Back integration and the presentation-only ownership boundary. All six Stage 5 tests pass in CI #1351.
- Updated the older spell-catalog and Sheet hierarchy guards so they continue enforcing the real architectural invariants — shared catalog spell membership and runtime-backed Class/Subclass navigation — without requiring the removed explanatory copy or the retired `Все` segmented switch. Those guards pass in CI #1351.
- Character Profile Stage 6 CI run #1355: production TypeScript/Vite build succeeded and lint completed with 0 errors / 22 warnings. The suite contains 634 tests and passed 624/634; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterSocialSections.test.ts` with six regression gates for the Stage 6 social stylesheet, Diary chronology/composer, Diary long-press plus explicit comments, adaptive media-first Gallery, shared empty/error presentation and the existing social/media persistence boundary. All six Stage 6 tests pass in CI #1355.
- Stage 2–5 character-profile regression families continue to pass under the Stage 6 social/media presentation changes; Stage 6 introduced no new failing test family.
- Character Profile Stage 7 CI run #1359: production TypeScript/Vite build succeeded and lint completed with 0 errors / 22 warnings. The suite contains 640 tests and passed 630/640; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterEditorPattern.test.ts` with six regression gates for the scoped Stage 7 stylesheet, shared editor hierarchy, mobile-sized/focus-visible controls, preserved permission boundaries, preserved specialized editor workflows and the presentation-only ownership boundary. All six Stage 7 tests pass in CI #1359.
- Stage 2–6 character-profile regression families continue to pass under the Stage 7 editor migration; Stage 7 introduced no new failing test family.
- Character Profile Stage 8 CI run #1365: production TypeScript/Vite build succeeded and lint completed with 0 errors / 22 warnings. The suite contains 645 tests and passed 635/645; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterProfileConsolidation.test.ts` with five regression gates proving that v4 is physically retired, v5 is the sole active migration layer over the explicit v3 compatibility foundation, directory/focus structure is self-contained, phone hierarchy/touch targets remain deliberate and the consolidation does not acquire mechanics or persistence ownership. All five Stage 8 tests pass in CI #1365.
- Updated `characterSheetHierarchy.test.ts` to guard the consolidated v5 selectors and explicit v3→v5 cascade instead of requiring the deleted v4 layer; the complete Character Profile Stage 2–7 regression families continue to pass under Stage 8.
- Character Profile Stage 9 CI run #1375: production TypeScript/Vite build succeeded and lint completed with 0 errors / 22 warnings. The suite contains 650 tests and passed 640/650; exactly the same 10 stale Voss/text-contract assertions remain the only failures.
- Added `characterAccessibilityStage9.test.ts` with five regression gates for shared keyboard-modal behavior, focus trapping/restoration, background scroll locking, 44px touch targets, keyboard-focusable uploads and the presentation-only boundary. All five Stage 9 tests pass in CI #1375.
- Updated the historical Stage 4 dismissal guard to assert the shared `useDialogSurface` contract rather than requiring duplicate local Escape handlers; all Character Profile Stage 2–8 regression families continue to pass under Stage 9.

### Known incomplete work

- Fighter mechanics/runtime remain `IN_PROGRESS` under the existing class-work ledger and were intentionally not changed by this rewrite.
- Character Profile v5 Stages 1–9 are complete for the current design/accessibility pass. The remaining `profile-v3__*` / `sheet-v3__*` and social `v2-*` class names are compatibility/legacy markup hooks still emitted by existing components; Stage 9 deliberately did not perform a mass selector rename because that would be code-hygiene work rather than a user-facing UX fix.
- The repository still has 10 stale Voss/text-contract assertions that must be reconciled with the already-authored class narration before the full CI suite can return green.

---

### Patch — 2026-09-02-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `34848d1c1670fb510a629cfef2054245b6052ba6`
**Started:** 2026-09-02
**Released:** 2026-09-02
**Release identity:** `main / a9f02222e4fa70a0bfa541fd2fa0e9711e458fb2`

### Player-facing changes

- Rewrote the complete active Druid Voss narration layer: the base class, all eight supported circles and their feature cards now read as battlefield recollections instead of generic class summaries.
- Circle of the Moon now follows the intended horror directly: Voss sees a healer who can become a predator without feeling a contradiction, not a lovable animal or warmly regarded pet. The same hands can close an ally's wound and tear open an enemy.
- Druid narration now consistently carries despair, concrete wartime consequences, irony and black humor as a coping mechanism while keeping the exact rules in their separate neutral layer.
- Rewrote the complete active Cleric Voss narration layer: the base class, all fourteen supported domains and every active domain feature now use Voss's subjective battlefield voice instead of a neutral grimdark observer.
- Cleric narration now centers Voss's prejudice that too many priests preach courage from the rear and retreat when the line breaks, while individual domains receive distinct judgements rather than repeating that thesis: Life earns reluctant respect for bloody field medicine, War for sharing the front line, Order reads as sanctified coercion, Peace as armed hypocrisy that can still save lives, and Tempest as rear-line artillery with a holy symbol.
- Completed and enabled all 13 supported Wizard subclasses in the class catalog: Abjurer, Diviner, Evoker, Illusionist, Enchantment, Conjuration, Necromancy, Transmutation, War Magic, Bladesinging, Order of Scribes, Graviturgy and Chronurgy.
- Every subclass now exposes its real actions, finite pools, class-spell access, proficiencies, resistances and structured passive rules at Wizard levels 3/6/10/14.
- Scene-dependent restrictions remain readable and GM-adjudicated instead of becoming fake turn/target/corpse trackers.

### Runtime and rules changes

- Replaced the contradictory global Voss authoring canon that previously forced warmth toward Circle of the Moon. The canonical voice contract now explicitly treats Voss's class judgements as his own veteran prejudices while preserving system text as neutral fact.
- Added durable authoring guidance for future AI/content passes: Druids are framed through the healing/predation duality; Clerics through Voss's rear-line coward prejudice; Bards through crowd manipulation and «Hope»; Wizards through informed, deliberate magical harm; Sorcerers through power without training and the danger of feeling chosen.
- The active Cleric literary source `src/data/classes/clericVossNarration.ts` is now self-contained rather than exporting most narration from the legacy file; the legacy source remains historical/reference material only.
- No Druid or Cleric mechanics, Character Engine contracts, rule triggers, resources, action economy or exact-rule text were changed by these narration passes.
- Added nine missing Wizard runtime packages and promoted the catalog runtime-ready set from four to all thirteen subclasses.
- Added generic formula mechanics for dynamic initiative so War Magic and Chronurgy automatically add Intelligence to Dexterity initiative.
- Added generic exact-value resource recovery (`restore: set`) for Power Surge, which now returns to exactly 1 after a Long Rest rather than filling to its Intelligence-based maximum.
- Kept canonical class spell methods on `class_spell` with ordinary spell-slot costs; subclass free casts use resource-backed actions through the shared template action executor.
- Added a generated forward-only Supabase installer at revision `wizard-subclasses-runtime@3`, including all level mechanics/choices, existing-campaign backfill and new-campaign bootstrap.
- Corrected two previously undeployed Wizard migration ambiguities discovered by PostgreSQL 17: spellbook progression level aliases and canonical Wizard class-spell method kinds.
- Applied the missing Wizard base/subclass migration chain to the connected Supabase target and certified 13 active packages with exact 3/6/10/14 rows.

### Repository / release process

- The active Druid literary source is `src/data/classes/druidVossNarration.ts`; the active Cleric literary source is `src/data/classes/clericVossNarration.ts`; shared future-author guidance is centralized in `src/data/vossVoice.ts`. Legacy/Gemini narration files remain reference material rather than the active canonical voice.
- Added a deterministic migration generator so SQL payloads are derived from the TypeScript Wizard runtime source.
- Promoted this patch through PR #41 and merged it to `main` as `a9f02222e4fa70a0bfa541fd2fa0e9711e458fb2`.

### Tests / verification added in this patch

- Druid narration rewrite was kept isolated from `src/data/classes/druidReference.ts`, so the exact mechanical source was not edited in this pass.
- Cleric narration rewrite preserves the existing public getter/export contract (`clericClassVossNarration`, `clericClassVossComment`, domain normalization and base/domain/feature getters) so `ReferenceGuide` wiring does not need a parallel UI rewrite.
- Existing exported Voss voice guards and Druid narration getter signatures were preserved so current reference rendering imports remain compatible.
- Expanded Wizard runtime coverage across all thirteen subclasses, including exact Power Surge recovery, initiative formulas, finite resources, slot alternatives, source metadata and persistent Chronurgy exhaustion.
- Added SQL/TypeScript payload-parity coverage for every subclass level and choice row.
- Added regression coverage for the generic exact-value resource recovery rule.
- Deployed-state audit: 13/13 subclass templates, revision `wizard-subclasses-runtime@3`, all 3/6/10/14 rows present, zero invalid class-spell method kinds and zero invalid spell costs.
- Full repository verification before these narration-only follow-ups: 609 tests pass; production build succeeds; lint completes with only the pre-existing warning set and no errors. The Druid/Cleric text follow-ups were not represented by a new full CI completion claim before release.

### Known incomplete work

- The remaining class text packages still need the same canonical Voss rewrite; the shared voice contract now records the intended axes so future passes do not invent a new tone per class.
- Supabase advisors still report pre-existing project-wide security/performance notices outside the Wizard package; this patch introduced no new table/RLS surface.

---

### Patch — 2026-08-31-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `a098751cabf5b8934494ac4725849b3781308a9b`
**Started:** 2026-08-31
**Released:** 2026-09-01
**Release identity:** `main / 2026-09-01-A`

### Player-facing changes

- Rewrote the complete authored Voss layer for every openable base-class and feature card of Fighter, Druid, Cleric and the rebuilt subclass-free Wizard, plus all 10 Fighter archetypes, 8 Druid circles, 14 Cleric domains and their feature cards. The new register uses concrete bodily consequences, black humor and exhausted hope without profanity or direct insults; Circle of the Moon remains a dangerous but warmly regarded protector rather than a disguised monster.
- Added the rebuilt **Wizard / Волшебник** class to the current class catalog, with authored 2024 class text and the new class bootstrap path.
- Added a dedicated Wizard **«Моя книга»** class panel.
- Added the physical **Wizard spellbook** as a real inventory item/runtime dependency rather than a boolean character flag.
- Spellbook contents now belong to a concrete inventory item instance. Losing, transferring, or destroying that book removes access to that instance and its recorded spells.
- A Wizard without a spellbook cannot change daily spell preparation. Previously prepared spells are not erased merely because the book is absent.
- GM/admin can add Wizard spells to a concrete spellbook through **«Выдать закл»**; the player sees only spells actually written in owned spellbooks.
- GENA daily preparation for Wizard is restricted to spells contained in an owned spellbook, with server-side validation rather than UI-only filtering.
- Wizard spell-slot capacity is class/level driven instead of relying on manually authored sheet slot maxima.
- Added a real **Магическое восстановление / Arcane Recovery** interaction. After a GM-granted Short Rest, the assigned player chooses actually expended spell slots to recover; the combined recovered slot levels are limited to `ceil(Wizard level / 2)` and no slot above level 5 is eligible.
- Added an explicit GM **Short Rest** control to the Wizard class surface so Arcane Recovery can be resolved through normal gameplay UI rather than a hidden/admin-only RPC.
- Ordinary Wizard slot casting now requires the spell to be prepared.
- **Знаток ритуалов / Ritual Adept** now exposes a no-slot ritual casting method only for ritual spells that are actually written in a physical spellbook currently held by the character.
- Added **Запоминание заклинания / Memorize Spell** to «Моя книга»: after an authoritative Short Rest the assigned player can replace one eligible prepared Wizard spell with another eligible spell from the held book.
- Added **Мастерство заклинаний / Spell Mastery** selections with the correct level/casting-time filters, always-prepared state, true no-resource lowest-level casts and only one mastered-spell replacement after each Long Rest.
- Added **Фирменные заклинания / Signature Spells** selections: two level-3 book-backed spells remain always prepared and each has its own free cast that recharges after a Short or Long Rest.
- GENA no longer counts Spell Mastery or Signature Spells against the ordinary prepared-spell quota.
- GENA now surfaces the Wizard cantrip replacement right as an informational post-rest notice. Cantrip changes, Scholar Expertise, ASI and Epic Boon sheet decisions deliberately use the normal player → GM sheet-edit path instead of class-specific mini-engines.
- Prepared the Wizard subclass foundation without exposing empty/incomplete subclass cards to players; individual subclasses become visible only when their actual package is implemented.

### Runtime and rules changes

- Hardened GENA post-rest preparation authority and one-shot locking for assigned players.
- Extended character-preparation metadata with stable class catalog identity so class-specific availability rules do not depend on localized display names.
- Extended inventory persistence with stable Chasovoy definition identity (`definition_id` + revision) for concrete item instances.
- Added Wizard spellbook runtime storage/RPCs and spellbook-aware preparation validation.
- Added authoritative Wizard spellbook progression: six level-1 spells at Wizard level 1 and two additional eligible Wizard spells for every later Wizard level.
- Added a reusable full-caster spell-slot mechanic that emits canonical `spell_slot_N` CE resources and leaves mutable current values in the shared character resource ledger.
- Added Wizard core mechanical grants for Intelligence/Wisdom saving throws, simple weapons, class skill selection and the one-use-per-Long-Rest Arcane Recovery resource.
- Added the missing authoritative Short Rest server seam: `grant_character_short_rest` performs normal `short_rest` resource recovery and opens a short-rest resolution window; ordinary assigned-player speech closes that window and Long Rest closes any stale one.
- Added a generic spell-slot restoration primitive that validates weighted recovery budgets, maximum slot level and actually expended slots against `character_resource_states` before mutating canonical slot state.
- Arcane Recovery uses a narrow Wizard server wrapper that verifies the active Wizard assignment, the Short Rest window, Wizard level and the real once-per-Long-Rest resource before restoring slots.
- Added durable Memorize Spell, Spell Mastery and Signature Spells state with server-side eligibility validation against the held physical spellbook.
- Spell Mastery uses a genuinely resource-free CE casting method; Signature Spells use separate CE resources with `short_rest` + `long_rest` recovery.
- CE runtime now projects held Wizard spellbook membership through read-only persistence queries rather than routing a source-loader read through a class-specific RPC.
- Manual Wizard choices that do not need deterministic bookkeeping are recorded as `gena_notice_then_gm_sheet_edit` / normal GM sheet edits rather than receiving bespoke choice state.
- Continued generic template-choice runtime cleanup and class-work ledger updates required by the current class rebuild.
- Added Wizard subclass **Wave 0** structural contract: exactly 13 supported stable catalog identities, a common `class:wizard` parent, subclass unlock at Wizard level 3, and the normalized 3/6/10/14 feature schedule used by the 2024 base class.
- Reserved stable visual identities for all 13 Wizard subclasses and added a structural package validator that rejects the wrong parent, an early unlock, unsupported catalog identities, or feature rows outside 3/6/10/14.
- PHB 2024 Evoker, Diviner, Illusionist and Abjurer are the canonical identities for those four schools; duplicate 2014 variants are not introduced. Older supported schools/supplements retain their rule package but enter through the Wizard 2024 compatibility schedule.
- Wave 0 deliberately reuses the generic rule-template resolver for parent-class effective level and CE emission; it does not introduce a Wizard-specific subclass engine, turn tracker, scene state or bespoke choice runtime.

### Repository / release process

- Added this persistent patch journal as the canonical ledger for everything accumulated on `dev` before release.
- Root `AGENTS.md` now requires every coding agent to update the Active patch as part of task completion.
- An explicit user command to promote to `main` now formally closes the current patch; after successful promotion, `dev` must open a new empty Active patch based on the new `main` SHA.
- Released patch history is immutable: later fixes belong to the next patch instead of being backdated into an already shipped release.

### Tests / verification added in this patch

- Added GENA preparation authority regression coverage.
- Added Wizard text-ready coverage.
- Added dedicated Wizard spellbook runtime regression coverage for physical item identity, GM spell authoring, book-gated GENA preparation and the «Моя книга» UI path.
- Added dedicated Wizard spellbook progression regression coverage for six starting spells, +2 per Wizard level and held-book grant validation.
- Added dedicated Wizard Arcane Recovery regression coverage for CE resource resolution, parser-owned full-caster slots, authoritative Short Rest, weighted slot restoration and Oracle/UI wiring.
- Added `wizardCompletionRuntime` coverage for prepared ordinary casts, held-book rituals, Memorize Spell, Spell Mastery, Signature Spells, GENA/manual-choice boundaries and shared strict class quality/resource/parser/CE gates.
- Added resource-policy metadata to every Wizard completion mechanics migration so the repository-wide class resource-policy gate audits the whole slice.
- Updated official class catalog coverage for the rebuilt Wizard catalog entry.
- Added `patchJournalContract` regression coverage so the repository cannot silently lose the patch-journal lifecycle contract.
- Added `wizardSubclassWave0` regression coverage for all 13 stable identities, PHB 2024 replacement policy, Wizard parent linkage, level-3 unlock, 3/6/10/14 feature rows and parent-Wizard-level multiclass gating.
- Added a dedicated Wizard Voss narration registry/coverage test and recalibrated the shared voice contract around concrete consequences, despairing black humor and explicit profanity/insult exclusion.
- Wizard dev runtime closure reached a fully green CI on run **#1152** before the subclass Wave 0 work; Wave 0 receives its own current-head CI check before completion is claimed.

### Known incomplete work

- The **Wizard 2024 base-class runtime has no known implementation blocker on `dev`** in the current subclass-free scope.
- Overall Wizard mechanics remain **IN_PROGRESS** because the intended deployed Supabase state has not yet been applied/certified and actual subclass content is still being built; Git-only closure is not production certification.
- Found-spell/scroll transcription, Scholar Expertise, cantrip replacement, ASI and Epic Boon use the agreed GM-adjudicated/normal-sheet path by design and are not missing Wizard-specific automation.
- Wizard subclass **Wave 0 infrastructure is complete on `dev`**, but no empty placeholder subclass is installed.

---

## Journal rules

The executable agent rule lives in `/AGENTS.md`. In short: work on `dev` belongs to the Active patch; an explicit user command to promote to `main` closes that patch; after successful promotion, `dev` immediately opens the next empty Active patch based on the new `main` SHA.
