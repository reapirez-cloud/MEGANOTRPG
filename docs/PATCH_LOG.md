# MEGANOTRPG patch log

This file is the canonical release journal for work accumulated on `dev` before promotion to `main`.

## Active patch — 2026-09-13-D

**Status:** OPEN
**Branch:** `dev`
**Base main:** `6789d1fdecc97699c2f6b34f597cf3c19182dd6a`
**Started:** 2026-09-13

### Player-facing changes

- Snake context menus now unfold smoothly from the exact long-press/right-click point, including after viewport flip/clamp; universal windows now reveal from darkness with a restrained cold-edge ignition and smoother Flow resizing.
- Snake windows now adapt from compact to full-size layouts by context, and complex interactions can run as one sequential multi-step window with Back/Next instead of a single overloaded form.
- Added the first universal Snake window runtime (Placeholder, Confirm, Editor, Picker, Detail and Notice/Error modes) so future interaction forms share one recognizable window system instead of entity-specific modal families.
- Location right-click / long-press actions now use the shared Snake floating context menu instead of the old inline expanding tray; unapproved management actions open the shared Snake Placeholder window.
- Replaced the mixed navigation assets with a new **all-PNG cold geometric pack**: compact `Я`, compact `Чаты`, and a deliberately very wide `Главная` whose horizontal lines nearly bridge the side controls.
- Reduced the visible floating glass navigation rail from **34px to 18px** while preserving **44px invisible hit targets**. Removed the detached lower filament entirely; active state now comes only from the PNG's cold glow/brightness.
- Reduced the UI 1.0 bottom content reservation to match the thinner persistent navigation instead of leaving the old oversized empty footer.
### Runtime and architecture changes

- Centralized Snake motion in the shared runtime: the invocation coordinate now drives menu transform-origin, window entry uses clipped cold reveal rather than generic scale-pop, and reduced-motion disables the non-essential effects.
- Added generic Snake Flow surfaces: each step may use Editor, Picker, Confirm or Detail content, may request its own window size, preserves an in-memory draft across Back/Next, and sends one combined payload to the action executor only on the final step.
- Migrated Locations as Snake proof #1 and removed LocationNavigator's local long-press timer, inline action menu and local placeholder machinery. Inventory is now the required proof #2.
- Explicitly made universal windows surfaces owned by Snake rather than a second dispatch agent: Snake retains entity/action context, gathers input through a surface, then forwards normalized input to the domain adapter that calls GENA, Oracle or an approved owner facade.
- Implemented Snake as the UI 1.0 interaction/action agent: generic entity/action/result contracts, one provider, one trigger, one-gesture/one-invocation handling, viewport-aware menu positioning and typed domain-provided executors.
- Supabase schema/data were intentionally unchanged for this navigation-only UI task; the connected project was confirmed `ACTIVE_HEALTHY` before implementation.
### Tests / verification

- Snake invocation/window motion head `4ac0fb47529bf279fdd99a058ac18cd4f1c481e3` passed Build, Lint, repository Test, Storybook build and Playwright smoke in GitHub Actions run `34756586309`.
- Adaptive multi-step Snake Window head `0a77a617b71e890047fb1d73746f8db5316479d0` passed Build, Lint, repository Test, Storybook build and Playwright smoke in GitHub Actions run `34754989500`.
- Snake core + Location migration code head `9fcbaf595910c52e8ca6fbef3b4806f45850f8b4` passed Build, Lint, repository Test, Storybook build and Playwright smoke in GitHub Actions run `34752526317`.
- Added Snake agent regression coverage for hidden/disabled actions and forwarding entity + surface input to a domain-provided executor; updated UI contracts to reject a return of the old Location long-press runtime.
- Final navigation code head `c9764cabcc9b022e5a3f35bb012fa734bb3547d2` passed Build, Lint, repository Test, Storybook build and Playwright smoke in GitHub Actions run `34751804750`.
### Known incomplete work

---

## Released patches

## Patch — 2026-09-13-C

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `d1bca7c46d5a9e8967cbac50bd9190d87abf6508`
**Started:** 2026-09-13
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-C`

### Player-facing changes

- Reworked the `Я` and `Главная` navigation glyphs as narrow aggressive geometric SVG marks keyed to the existing `Чаты` icon language, then wired them into the slim glass rail; the favored Chats asset remains the visual reference rather than being replaced by a softer icon-pack style.
- Rebuilt the UI 1.0 bottom navigation as a **34px floating translucent glass rail** with 48px invisible hit targets, narrow PNG slots and a restrained cold-light active filament; removed the previous tall hull/Home crown geometry.
- Finalized the immersive UI 1.0 World vocabulary as **Локации / Персонажи / Лор / Карта**. Player-controlled characters / PCs are called **Игроки** on party/workspace surfaces; technical `npc` / `locations` identifiers remain internal where useful.
- Removed the remaining player-visible `Зона` / `NPC` wording from UI 1.0 Home, location hierarchy, character cards and chronology labels while preserving technical `zone` / `npc` source identifiers internally.
- The temporary **Зоны / NPC** wording from the first cleanup pass was superseded in the same active patch by the final immersive terms **Локации / Персонажи**.

### Runtime and architecture changes

- Updated the canonical UI 1.0 visual contract: the global app direction is now **dead cold light** over graphite/iron, with sparse cold glow rather than warm ornamental gothic styling. Future class surfaces may temporarily override scoped accent/light tokens to express class identity; ordinary sections keep the shared MEGANOT palette.
- Superseded the oversized raised-center bottom dock direction with a planned **maximally slim translucent glass navigation rail** that preserves room for PNG navigation artwork while minimizing obstruction of reading content.
- Added the canonical planned **Snake** UI interaction/action-agent contract. Snake owns no domain state: entity integrations supply action manifests, Snake owns universal interaction surfaces/gesture handling and dispatches selected actions into the existing GENA / Oracle / explicit-owner paths.
- Defined universal schema-driven UI surfaces (ContextMenu, Confirm, Editor, Picker, Detail, Notice/Error, Placeholder) so UI 1.0 does not grow separate modal/menu families for locations, inventory, NPCs and other entity types. Deferred domain interfaces must remain universal placeholders until explicitly designed.
- Marked the current location-specific long-press implementation as temporary and forbidden as a copy pattern; Locations are the first planned Snake migration target and Inventory the second reuse proof.
- Added `docs/UI_V1_CURRENT_STATE_2026-09-13.md` as the canonical redesign status snapshot and made `AGENTS.md` point future agents there before UI 1.0 work. Older redesign stage files are now explicitly historical/superseded where their implementation claims no longer match the isolated app.
- Corrected Society News publication from a direct React -> Supabase write to the named-engine path `UI -> Oracle -> Larisa -> campaign_updates`. Larisa now owns the explicit descriptive campaign-announcement command and emits a campaign-scoped engine event.
- Clarified that the old Stage 2 Foundation claims about `MotionConfig`, `LayerHost` and Meganot Radix wrappers are not current isolated-tree capabilities after the hard-isolation reset.
- Marked the old UI 1.0 visual-direction file as partially superseded because its dominant `Что нового` Home composition no longer matches the product, and marked the Character UX audit as deferred future-stage input rather than a current implementation order.

### Tests / verification

- Final pre-release code head `577c6417f4cc18eb9b103da9f82ed803fb8aabda` passed Build, Lint, repository Test, Storybook build and Playwright smoke in GitHub Actions run `34750736704`.
- Added repository contract coverage ensuring Snake remains discoverable, entity-agnostic, non-owning, placeholder-aware and explicitly referenced from the temporary location long-press seam.
- Extended Oracle/UI 1.0 contract tests so campaign announcements must dispatch through Oracle -> Larisa, World labels remain canonical, the NPC surface stays NPC-only, and historical redesign documents cannot silently masquerade as current implementation truth.
- Updated the UI 1.0 Playwright smoke assertions to the final **Локации / Персонажи** vocabulary so end-to-end verification matches the actual interface.

### Known incomplete work

- Snake is documented/planned but not implemented yet. The current Location long-press menu still has the known touch timer + synthetic contextmenu double-invocation defect and must be replaced by Snake rather than patched into a reusable pattern.
- Workspace, Chats, Map, the dedicated Art/gallery surface and several detail/editor flows remain intentional UI 1.0 placeholders. Their status is now centralized in `docs/UI_V1_CURRENT_STATE_2026-09-13.md` rather than being ambiguous debt.

---

## Patch — 2026-09-13-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `2893fa8afd795f1ed323ca4576562a10f48216b1`
**Started:** 2026-09-13
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-B`

### Player-facing changes

- Replaced the location long-press bottom sheet with a contextual inline action tray that unfolds directly from the pressed location tile. Sibling tiles move smoothly through Motion layout and fade slightly while the active location remains visually anchored.
- Disabled native text selection / long-press callouts on location controls so Telegram/Android no longer offers Copy/Select while the app is opening its own action tray.
- Removed the prematurely designed create/edit/transition/delete forms from UI 1.0. The actions remain visible in the extensible manager action registry, but now open clean in-place placeholders until each management interface is explicitly designed. The root + action follows the same rule.

### Runtime and architecture changes

- Reduced the isolated location adapter back to read-only world data for this stage; UI 1.0 no longer imports Oracle/Larisa mutation commands from the location navigator before the corresponding management interfaces are approved.

### Tests / verification

- Updated UI 1.0 contract tests to require inline long-press actions, native-selection suppression and placeholder-only management flows, while explicitly rejecting the previous bottom-sheet CRUD implementation.
- CI run #2215 passed Build, Lint, repository tests, Storybook build and Playwright smoke on the release code head before promotion.

### Known incomplete work

---

---

## Patch — 2026-09-13-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `b8c0ca8186f41faa7c09c94f384796d1c8f035f0`
**Started:** 2026-09-13
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-A`

### Player-facing changes

### Runtime and architecture changes

- Fixed the UI 1.0 campaign-membership typing regression that narrowed `membership` to `null` inside the fallback branch and caused production TypeScript builds to fail before Vercel deployment.

### Tests / verification

### Known incomplete work

---

---

## Patch — 2026-09-12-C

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `c42f7ebe389b290e3c4bf74588cf338f75c0807b`
**Started:** 2026-09-12
**Released:** 2026-09-13
**Release identity:** `main / 2026-09-13-C`

### Player-facing changes

- Rebuilt UI 1.0 «Мир → Локации» as a contextual hierarchy navigator instead of a flat list. Root zones appear first; selecting a zone preserves the full ancestor chain at 100% width, removes unrelated siblings and shows only the selected zone's direct children at 90% width below it.
- Added a separate «Переходы» group beneath «Подзоны». Selecting a transition rebuilds the navigator around the target zone's real parent chain, keeping containment and travel topology visually distinct.
- Added a reserved right-side open control on every location preview (ready for the user's later PNG asset) plus a long-press action sheet. Long press exposes «Открыть зону» for everyone and manager-only «Добавить подзону / Добавить переход / Редактировать / Удалить» actions.
- Added a GM/owner + control for creating new root zones. Creation/editing, transition creation and cascade-aware deletion confirmations are functional; the full location-detail screen remains an explicit UI 1.0 connection seam rather than being designed early.
- Kept «Карта» intentionally untouched as its own future destination.

- Replaced the UI 1.0 placeholders for «Мир», «База знаний», «Новости общества» and «Достижения» with real isolated section screens while leaving Home composition unchanged.
- «Мир» now opens an extensible four-tile hub for Локации / Персонажи / Лор / Карта. Existing visible locations, characters and lore are read from current Supabase data; Map is intentionally only a connected destination and no map implementation was started.
- «База знаний» now opens an extensible tile hub backed by the existing class, invocation, spell and bestiary sources. Live catalogs get lightweight searchable lists; future categories can be added through the section registry without rewriting routing.
- «Достижения» now renders only narrow visual preview strips with the achievement title. Character linkage remains in the data contract through `character_id`; no detail screen or mechanics were added ahead of scope.
- «Новости общества» now uses the existing `campaign_updates(kind = announcement)` model. GM/owner users alone see the + publish control; players receive a read-only chronology.

- Attached the approved coastal grimdark panorama to the UI 1.0 «Мир» entry. The Home preview now uses the real campaign artwork instead of the dark fallback.

- Removed the duplicated «Что нового» hero from UI 1.0 Home. The chronology now has one Home entry point: «Последние события» / «Все», instead of two controls opening the same destination.
- Promoted «Мир» to the first Home destination while keeping its visual footprint restrained rather than replacing one oversized hero with another.
- Added «База знаний» as the second Home destination with a compact preview for rules, items, spells and bestiary plus its own isolated placeholder route for later implementation.

- Rebuilt UI 1.0 Home around mixed content types instead of six oversized preview tiles: «Что нового» is the single hero, «Мир» is a shorter visual entry, society news and achievements are editorial rows, and «Арты» is a compact live thumbnail strip.
- Removed «Обновления» from Home entirely and stopped surfacing `update` feed rows in Home's recent-event preview; the existing deep route remains only as a future relocation seam.
- Moved «Последние события» below the main campaign destinations and reduced it to a compact three-item chronology preview.
- Connected Home to real campaign cover art, gallery previews and achievement count/latest-title data already present in Supabase. Society news stays honest: if no GM/announcement source exists yet, Home shows a quiet empty state instead of rebranding application updates as campaign news.

- Replaced the UI 1.0 Dock SVG masks with generated transparent PNG artwork for Я, Главная and Чаты, keeping the approved 25/50/25 dock geometry while testing a richer metallic icon treatment.

- Replaced the UI 1.0 Dock's flat SVG mask icons with the generated metallic PNG navigation assets for Я, Главная and Чаты so the local build can be compared directly against the earlier vector treatment.

- Replaced the UI 1.0 «Что нового» placeholder with a full campaign chronology: date-grouped editorial stream, sticky day labels, a narrow time rail and source-specific composition without uniform feed cards.
- The chronology renders the full available publication copy for GM/campaign updates, diary posts, achievements and moments, preserves non-art media attachments, and deliberately excludes standalone art feed items.
- Added progressive loading for older history while keeping the newest events first.

### Runtime and architecture changes

- Extended UI 1.0 section routing with stable tail segments so selection lives at `#/home/world/locations/<id>` and the future detail surface at `#/home/world/locations/<id>/detail`. The section-level Motion key stays stable across depth changes so a child preview can animate from 90% width into the 100% ancestor path.
- Added an isolated location adapter that reads parent ids, signed preview art, visible sections and RLS-filtered location links. Existing Supabase RLS remains the authority for which zones and transitions a player is allowed to see.
- All new GM world mutations follow the existing canonical command path `UI → Oracle → Larisa`: location create/update/delete and transition section/link creation do not bypass the world owner with direct React table writes.

- Added data-driven UI 1.0 registries for World and Knowledge Base sections. Unknown/new subsection routes degrade to isolated connection placeholders, so future tiles such as «Предметы» can be introduced without changing the root router.
- Added an isolated campaign-scope/data adapter for section screens instead of importing legacy CharacterContext or legacy World/Reference components.
- Corrected Home society-news lookup to read the canonical `campaign_updates` announcement source instead of querying impossible `feed_items.source_type` values. Existing `feed_items` Realtime acts only as a refresh signal for announcement and achievement lists.

- Added the optimized World preview asset at `public/ui-v1/world/world-preview.webp` (640×213 WebP, ~21 KB). Supabase `campaigns.cover_url` is the connection point, so the existing isolated Home cover pipeline owns rendering instead of a one-off hardcoded image branch.

- Extended the isolated Home data adapter to resolve signed campaign cover/gallery media, achievements and future society-news feed sources while preserving UI 1.0's hard separation from legacy screens.
- Home Realtime refresh now listens to feed items, campaign art and achievements so the new compact surfaces stay current without treating Realtime as canonical storage.

- Navigation artwork now loads as portable raster assets from `public/ui-v1/nav-icons/*.png`; the previous SVG masks are no longer referenced by UI 1.0.

- Navigation artwork now loads as optimized transparent PNG files from `public/ui-v1/nav-icons/**`; the superseded SVG files were removed so the Dock has one active asset source instead of two competing implementations.

- Added a repository-wide mandatory working-placeholder rule: when a requested integration cannot be connected safely yet, agents must leave a stable working seam/placeholder for later attachment instead of faking completion, dropping the feature, or routing the new UI back into legacy behavior.

- Added a dedicated UI 1.0 chronology data adapter that resolves campaign membership, author/profile identity, character identity and signed campaign-media URLs without importing legacy UI contexts.
- Supabase Realtime remains a refresh signal rather than the only source of truth: every feed change triggers a fresh chronology query.
- Added stable future source presentation/connection slots for GM notes, world, zone, NPC, lore and system events. The current database still constrains feed source types to diary/art/achievement/update/moment, so future source kinds remain intentionally unpersisted until a dedicated migration is approved.

### Tests / verification

- Added a UI 1.0 repository guard for the committed World preview asset so the campaign cover cannot silently disappear from source control.

- Updated UI 1.0 isolation tests to lock the mixed Home composition, smaller hero proportions, removal of the Home updates entry, real gallery/achievement/cover integrations and the new ordering with recent events below destinations.

- Added UI 1.0 chronology contract coverage for non-art aggregation, full copy rendering, author/character lookup, Realtime refresh, sticky date grouping and future source connection slots.
- Expanded Playwright smoke coverage so «Что нового» must open as the real chronology screen before returning to Home.

### Known incomplete work

- Dedicated new-UI detail pages for diary entries, achievements, zones, NPCs and GM publications are not implemented yet. Each chronology event already carries a stable source-type/source-id connection slot so those links can be attached later without changing the chronology layout.
- The database source-type constraint still needs a deliberate migration before native world/zone/NPC/GM-note events can be emitted as first-class feed types.

---

---

## Patch — 2026-09-12-B

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `6b2c4372be73d9df0c27704fed02c7361d817e64`
**Started:** 2026-09-12
**Released:** 2026-09-12
**Release identity:** `main / 2026-09-12-B`

### Player-facing changes

- Replaced all visible Dock labels with three custom MEGANOT line icons: personal identity on the left, a wide portal/horizon mark for Home across the 50% center slot, and a dialogue glyph for Chats. Accessible names remain on the buttons while visible text is gone.
- Removed the oversized «Главная картина» intro from Home. The screen now opens on compact «Последние события» so the newest campaign activity is visible without scrolling past navigation previews.
- Connected the Home event strip to the real campaign feed: it shows the three newest non-art events across moments, diary entries, achievements and GM/campaign updates, and refreshes through Supabase Realtime.


- Added mobile-first root navigation gestures to UI 1.0: deliberate horizontal swipes move between Я / Главная / Чаты while vertical scrolling remains native.
- Added restrained soft haptics for root navigation, preferring Telegram HapticFeedback when available and falling back to a short browser vibration on supported devices.
- Replaced the active Dock frame with a local grayscale glow and stronger Home-crown glow so location remains visible without introducing another moving rectangle.

- Refined the new raised-center dock interaction: active states now appear inside their own segment instead of sliding across the raised Home crown, and mobile blue tap flashes are suppressed while keyboard focus remains visible.
- Reduced the start-page preview scale for a denser, calmer composition and rebalanced the secondary row so the full «Достижения» label fits cleanly.

### Runtime and architecture changes

- Added a UI 1.0-only Home data adapter. It resolves the remembered campaign membership, reads the campaign title and recent feed rows, and does not import legacy page/UI context.
- Added portable SVG source assets for the three navigation marks so the same geometry can be imported into Figma later without raster recreation.


### Tests / verification

- Added repository assertions for icon-only navigation, stable accessible labels, Home ordering, feed integration, art exclusion and Realtime subscription.
- Updated Playwright expectations to the new «Последние события» Home hierarchy.


### Known incomplete work

- The same navigation SVGs still need to be imported/rebuilt as editable Figma components; the Figma MCP Starter plan hit its tool-call limit during this change, so no false claim of a completed Figma write is recorded.
- The full «Что нового» chronology screen remains a connected placeholder; this patch only surfaces the latest real feed events on Home.



---


## Patch — 2026-09-12-A

**Status:** RELEASED
**Branch:** `dev` → `main`
**Base main:** `995626bae3d4502ea072c0cb7b4ceb7480fd89f6`
**Started:** 2026-09-12
**Released:** 2026-09-12
**Release identity:** `main / dd4758fb528b18b8c834c8a19132f073caa0504a`

### Player-facing changes

- Introduced the new MEGANOT UI 1.0 as a completely separate interface built from scratch rather than a restyle of the legacy application.
- Made UI 1.0 the default application entry at `/`; the untouched previous interface remains temporarily available at `/legacy.html` while replacement work continues.
- Added the first new start page with a graphite / steel / stone grayscale palette, warm off-white typography, asymmetric editorial section hierarchy and image-ready preview surfaces.
- Added stable new-UI destinations for What’s New, World, Society News, Achievements, Art, Updates, Chats and Я. Destinations that are not designed yet intentionally render UI 1.0 placeholders instead of legacy screens.
- Reworked the bottom navigation into a MEGANOT-specific 25 / 50 / 25 dock: Я and Чаты sit in the lower hull while Главная rises as a central crown rather than using a stock flat tab bar.
- Completed the Rogue literary reference roster for the supported base class and nine subclasses, including the remaining Mastermind, Scout, Phantom, Steady Aim and Slippery Mind material.

### Runtime and architecture changes

- Physically isolated UI 1.0 under `src/ui-v1-isolated/**`; the new entry does not import legacy pages, legacy CSS, `src/App.tsx`, CharacterContext or other old visual-tree dependencies.
- Added a mandatory placeholder-first integration contract: future routes are wired early, but deferred features stay as clean new-UI placeholders until their dedicated implementation stage.
- Added a hard repository rule that the legacy UI is not a visual foundation for UI 1.0 and must not be mounted under new navigation.
- Added a current visual-direction contract for UI 1.0: graphite/charcoal/steel/stone neutrals, campaign-art-driven color, asymmetric composition and a recognisable raised-center navigation silhouette.
- Added a production multi-entry Vite build so the default new UI, the temporary `ui-v1.html` alias and `legacy.html` all build explicitly during the transition.
- Added the Rogue seven-stage READY plan and Stage 1 source freeze for all 61 supported features without activating Rogue runtime. Rogue remains reference-only / mechanics NOT_STARTED until Stage 2.
- Corrected Rogue reference mechanics discovered during the source freeze, including Arcane Trickster Spell Thief scope and Wave 3 Mastermind/Scout/Phantom rule details.

### Tooling and design workflow

- Added Motion for React, Radix primitives and React Router foundation dependencies for future UI 1.0 work.
- Added Storybook with Docs/a11y and Playwright mobile smoke coverage, including CI build/test steps.
- Added a separate Figma design file/workflow for UI 1.0 so composed screens are designed and reviewed independently before deeper implementation.
- Added character UX audit and UI 1.0 architecture/design documents used to guide the new-interface work.

### Verification

- Final `dev` code head before release passed Build, Lint, repository tests, Storybook build and Playwright smoke in CI.
- `main...dev` was reconciled immediately before release: `dev` was 50 commits ahead and 0 commits behind `main`.
- No Supabase migration or new Rogue runtime state was introduced by this patch.

### Known incomplete work

- UI 1.0 currently contains the start page plus placeholders; Chats, Я/Workspace, World, feed/content sections and deeper gameplay surfaces still require dedicated new-interface stages.
- `legacy.html` remains only as a temporary transition entry and will be removed after required functionality has been rebuilt in UI 1.0.
- Rogue mechanics/runtime remain NOT_STARTED after the completed Stage 1 source freeze; Stage 2 is the next runtime implementation stage.

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