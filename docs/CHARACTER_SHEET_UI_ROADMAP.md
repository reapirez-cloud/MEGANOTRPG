# Character Sheet UI Redesign Roadmap

Status: active source of truth for the new character sheet UX.
Branch: `dev`.
Do not merge to `main` as part of character-sheet stages without separate approval.

## Product target

The character sheet is a persistent character shell, not a stack of unrelated pages.

Persistent upper area:
1. portrait / identity;
2. thin vertically scrollable navigation next to the portrait;
3. 50/50 quick stats + abilities.

Only the area below that shell changes for normal sheet sections.

Inventory is the single exception: it opens a dedicated full interface because it owns spatial grids, bags, equipment, drag/drop and its own Snake context.

The visual language is gray graphite with subtle transparent surfaces. Pure/near black is not the page canvas. Black is reserved for shadows, image veils and modal backdrops.

The graphite system is the shared structural fallback. A later class-skin stage gives every class its own palette and atmospheric sheet-background underlay without changing the shared layout or interaction model.

## Navigation contract

Sections rendered inside the sheet:
- Overview;
- Умения / features;
- Заклинания / spells;
- Биография / biography;
- future sections may be appended to the scrollable right navigation without changing shell height.

Dedicated interface:
- Инвентарь.

Normal tap triggers the primary action.
Long press opens Snake contextual actions.
The right navigation is vertically scrollable, has no visible scrollbar and must not increase the portrait/header block height.

## Sorting contract

### Features / Умения

Never render one flat list.

Primary groups:
1. class;
2. subclass;
3. race;
4. background;
5. item;
6. effect;
7. other.

Inside a group:
1. action;
2. bonus action;
3. reaction;
4. passive;
5. other;
then unlock level and name.

Unknown sources go to "Прочее", never silently mix into a normal source group.

### Spells

Never render one flat list.

Groups:
- cantrips / level 0;
- levels 1..9.

Inside a level:
- prepared first when the class actually uses preparation;
- then alphabetical order.

Full spells mode later adds compact filters for prepared, school, concentration and ritual.

Tapping a spell slot preview on Overview switches to Spells and focuses the corresponding level.

## Resource + spell visuals

Spell slots have class-specific color and later class-specific PNG form.
Available slot = class color + glow.
Spent slot = same shape, desaturated gray, no glow.

Unique resources are keyed by `state_key` and later receive their own PNG and color.
Example: `channel_divinity` must be rendered as actual charge icons, not just "2/2".
Available charge glows; spent charge is gray.

Until final PNG assets exist, UI uses neutral placeholders with stable dimensions. Layout must never depend on the final artwork.

## Media / admin editing contract

Use the existing media system:
- `media_assets`;
- `media_bindings`;
- `campaign-media` storage;
- Snake media player.

Do not create a parallel icon storage system.

Admin media editing is implemented through Snake long press:
- character portrait / panel avatar / sheet hero keep their existing character-control permissions;
- class sheet background, class-resource PNG, class spell-slot PNG and exact `resource:<state_key>` PNG overrides are owner/admin-only;
- every override supports upload/replace and safe reset back to the next fallback layer;
- PNG icon uploads preserve PNG transparency;
- saved crop/presentation data is consumed by portrait, icon and class-background rendering.

Players can read bound reference assets but cannot edit owner-only class/reference media.
Authorization is enforced server-side through the existing media guards, not only by hiding buttons.

## Snake contract

Snake remains the universal context layer.

It must receive enough active UI context to understand:
- character;
- current sheet section;
- expanded ability;
- selected feature;
- selected spell;
- selected resource;
- inventory mode and active holder when inventory is open.

Normal tap is still the primary UI interaction. Snake must not become a substitute for visible navigation.

## Stages

### Stage 1 — Graphite visual foundation [DONE]
- dedicated character theme layer;
- graphite canvas and surface hierarchy;
- subtle transparency;
- stronger readable gray text tiers;
- thin divider hierarchy;
- neutral ambient-background placeholder;
- no pure black page canvas;
- shared graphite tokens prepared for the future standalone inventory interface.

### Stage 2 — Persistent CharacterSheetShell [DONE]
- old CharacterView layout removed instead of restyled;
- legacy `character-view.css` deleted from the repository;
- new dedicated `CharacterSheetShell` introduced;
- portrait left (~42%);
- navigation rail right (~58%);
- fixed upper block height;
- identity information integrated into portrait without oversized hero;
- Snake remains attached to the character/portrait context;
- lower content area intentionally stays clean for Stages 5–8.

### Stage 3 — Scrollable right navigation [DONE]
- thin 40–42px rows;
- fixed-height internal vertical scroll independent from navigation item count;
- hidden scrollbar + touch scrolling + contained overscroll;
- top/bottom fade;
- stable placeholder icon slots for future PNG assets;
- active section treatment is a thin accent line + text/icon emphasis, never a heavy filled card;
- navigation remains data-driven: future entries are appended to `CHARACTER_SHEET_NAVIGATION` without changing shell height or layout.

### Stage 4 — Navigation behavior [DONE]
- Inventory opens a dedicated full interface mode and never renders inside the sheet content area;
- the standalone inventory mode is intentionally a clean placeholder until Stage 14, so the removed legacy inventory UI is not resurrected;
- features/spells/biography replace only the dynamic lower content while portrait/navigation shell stays mounted;
- first transition from Overview creates one internal browser-history step;
- switching between inner sections replaces that step instead of stacking navigation garbage;
- back from any inner section returns directly to Overview;
- back from Overview leaves the character route;
- Inventory creates its own history step and returning from it restores the exact previous sheet section;
- popstate is handled locally so browser / Android back follows the same model;
- active section is reflected in the rail and AI view context.

### Stage 5 — Core 50/50 block [DONE]
- persistent 50/50 core is mounted between masthead and dynamic lower content;
- the left side reads resolved Character Engine values only: AC, passive Perception, proficiency, initiative, speed, plus spell save DC / spell attack when a spellcasting ability exists;
- the UI does not recalculate ability modifiers and does not fall back to cached legacy sheet values while CE is resolving;
- stable placeholder icon slots are reserved for the future quick-stat PNG set;
- the right side shows all six CE-resolved abilities with score + modifier;
- tapping an ability replaces the six-row matrix with that one expanded ability in the same right column;
- the expanded state shows the CE-resolved saving throw plus only skills whose resolved `ability` points to that characteristic;
- proficiency and expertise markers come directly from CE `proficiencyRank`;
- tapping the expanded ability again returns to the six-stat matrix;
- expanded ability is exposed in the AI/Snake view context for later Stage 11 contextual actions.

### Stage 6 — Overview [DONE]
- Overview is now a real CE-backed surface, not a placeholder;
- finite class/subclass resources are separated from spell-slot resources by state identity;
- resource labels come from the CE resource-sync contract rather than being guessed from state keys;
- each resource renders actual charge icons: available charges use the resource accent + glow, spent charges are cold gray; the numeric fraction remains secondary;
- known resources have distinct accents now, while every unknown/future state key safely falls back to the class/resource accent and automatically receives a stable `resource:<state_key>` PNG slot;
- standard `spell_slot_1..9` ledgers render in a dedicated spell-slot block;
- Warlock Pact Magic is recognized as spell-slot UI too: slot count comes from `warlock_pact_slots` and cast level from CE value `warlock_pact_slot_level`;
- spell-slot color inherits the active class accent and every class has a stable future PNG slot via `class:<classKey>:spell_slot`;
- spell levels are vertical, approximately four rows remain visible, additional levels scroll inside the compact viewport;
- available spell slots glow in the class color, spent slots use the same placeholder shape in gray;
- normal spell-slot tap opens the Spells sheet section; Stage 9 will refine this to focus the exact tapped level;
- long press on resources and spell slots opens Snake detail without stealing the normal tap behavior;
- Overview shows at most four resolved actions, prioritizing currently available action / bonus-action / reaction mechanics, with Snake detail on tap/long press;
- resistances and immunities get a compact protection preview rather than dumping all capability data into Overview;
- “ВСЕ” links route from the preview to the full Features or Spells section.

### Stage 7 — Features mode [DONE]
- Features mode now consumes the resolved Character Engine contract instead of dumping raw `character_features` rows;
- resolved feature grants, traits and CE actions are combined into one catalog;
- a feature grant and action with the same resolved source + label are merged into one row instead of appearing twice;
- primary grouping follows the fixed order: class → subclass → race → background → item → effect → other;
- template-backed provenance is resolved back to the actual `rule_template`, so groups show real class/subclass/race names rather than mechanic keys;
- legacy manual features use their explicit kind when it is trustworthy (`class_feature`, `racial_trait`); unknown provenance stays in “Прочее” rather than being guessed;
- inside each source, rows are ordered by action → bonus action → reaction → passive → other, then resolved unlock level and name;
- timing for executable mechanics comes from CE action economy; passive feature rows are not inferred from prose;
- action availability is visible without turning the list into cards;
- tap opens the resolved feature/action detail; long press opens Snake with “Подробнее” and “Источник” context actions;
- selecting a feature updates `selectedFeatureId` in the AI/Snake view context;
- empty source categories are not rendered, so the screen stays compact as new source types are added.

### Stage 8 — Spells mode [DONE]
- the sheet is read-only for spell preparation: GENA/chat remains the only player preparation workflow;
- preparation ownership stays in `useChatPreparation` / `ChatPreparationCard` and authoritative GENA RPCs; the profile does not call `setSpellPrepared` or create a second preparation path;
- spell preparation state displayed in the sheet comes from resolved CE access data (`preparationMode` + `prepared`), including always-prepared and no-preparation access;
- resolved spells are grouped by cantrips / levels 1..9, with empty levels omitted;
- inside each level, prepared / always-prepared spells sort first only when the resolved character actually has preparation-based accesses, then names sort alphabetically;
- compact filters are available for prepared, concentration, ritual and school;
- CE remains authoritative for spell identity/access/availability; spell-catalog metadata only enriches presentation fields such as concentration, school and detailed rules;
- legacy `character_spells` rows are used only as presentation metadata fallback and are never treated as an independent preparation controller;
- every spell row shows preparation state, school, ritual/concentration flags and a compact deterministic summary of resolved access sources;
- tap opens Snake spell detail and updates `selectedSpellId`; long press exposes Snake “Подробнее” and “Источник” actions;
- preparation-related spell detail explicitly points the player back to GENA after rest instead of offering a profile-side toggle;
- unresolved or template-only spell accesses remain visible even when no legacy `character_spells` row exists.

### Stage 9 — Spell-slot linkage [DONE]
- every standard spell-slot row on Overview passes its exact resolved level into the Spells section;
- Warlock Pact Magic passes the CE-resolved current pact cast level rather than character level or a guessed slot tier;
- entering Spells from a concrete slot stores a transient `spellFocusLevel` and smoothly scrolls to that level group after render;
- the focused level receives only a subtle spell-accent treatment, not a new card/layout;
- selecting a spell clears the transient level focus so it does not keep hijacking later interaction;
- entering Spells from the right navigation or the “ВСЕ” link clears stale focus and opens the normal top of the spellbook;
- empty or invalid focus levels fail safely: no fabricated spell group is created;
- `spellFocusLevel` is exposed in the sheet AI/Snake context for later contextual navigation;
- class-specific spell-slot visuals now have an explicit UI contract: `--cv-spell-accent`, `--cv-spell-accent-soft` and stable `class:<classKey>:spell_slot` media slot;
- the current theme derives spell accents from each class accent, while Stage 12 may replace only the visual PNG without touching navigation or slot logic.

### Stage 10 — Entity navigation [DONE]
- one shared `characterSheetEntityNavigation` layer owns entity targets for feature, resource, spell, item and effect;
- UI components no longer decide destination architecture themselves; they emit a typed entity target and CharacterView performs the route/state transition;
- CE provenance is parsed instead of names: `item:<id>` / `inventory_item` opens Inventory with the exact focused item; feature sources resolve to Features; effect/status/condition sources resolve to the effect-focused Features view;
- resolved action resource costs/effects create real links back to the exact resource `stateKey`;
- resolved spell casting resource options create real links back to their exact resource `stateKey`;
- resource context can navigate to resolved actions and spells that actually consume that resource;
- feature/action and spell Snake menus expose a compact “Связано” branch backed by the same entity router;
- entity navigation to Features scrolls/highlights the matching resolved feature/action/source key;
- entity navigation to Spells scrolls/highlights the exact spell key, while Stage 9 level focus remains available as a secondary hint;
- entity navigation to Overview scrolls/highlights the exact resource;
- item navigation already preserves `focusedItemId` inside the standalone Inventory interface so Stage 14 can attach the real grid without redesigning routing;
- normal right-rail navigation clears transient entity focus, preventing stale cross-links from hijacking later visits;
- selected feature/spell/resource/effect/item identities are synchronized in CharacterView state for Stage 11 Snake context.

### Stage 11 — Snake UI context [DONE]
- SnakeProvider now owns a synchronized view context in addition to menu/surface state;
- CharacterView builds one authoritative sheet context and sends the same object to both AI view context and Snake, preventing section/entity drift between the two systems;
- context tracks character, current section/interface, expanded ability, selected feature/spell/resource/effect/item, entity navigation focus, spell-level focus and reserved inventory-holder focus;
- the current selected entity becomes the active context entity (feature, resource, spell, item or effect) instead of leaving Snake anchored only to the character root;
- authority is explicit in context as admin / gm / player, together with canManage, canControlCharacter, isOwner and assignedToCurrentUser;
- Snake permission capabilities are exposed separately for inspect/navigation, media editing, character control and campaign/character management;
- authorization remains owned by the existing runtime checks rather than duplicated inside Snake: workshop mutation actions are only created when `canManage`, while character media actions are only created when `canControlCharacter`;
- read-only feature/resource/spell navigation and detail actions remain available without granting mutation rights;
- Snake menu AI context now inherits the underlying sheet route, text, entity facts and authority context while adding menu actions/path/depth;
- Snake surface windows (detail/media/confirm/editor/etc.) now publish their own higher-priority AI context, including surface kind, source action, path and errors, while retaining the underlying sheet context;
- closing/unmounting the character sheet clears its Snake view context so stale character/entity state cannot leak into another screen;
- the public character-sheet Snake context-key contract now includes interfaceMode, effect/item selection and authority fields for Stages 12–16.

### Stage 12 — Visual identity, class art and resources [DONE]
- the user-authored full-color PNG class-icon pack is the primary Character Sheet icon set; neutral silhouette atlases remain only as safe fallbacks;
- authored class-resource and spell-slot icons are optimized into two 4×4 atlases, including reserved mappings for fighter, warlock, cleric, druid, bard, paladin, sorcerer, wizard, rogue, monk, barbarian, artificer and ranger;
- the latest redraws supersede earlier Warlock, Bard and Cleric variants;
- spent charges keep the authored silhouette in grayscale and receive the separate user-authored red `spent-resource-cross.png` overlay;
- thirteen finished 9:16 class backgrounds are now built into the sheet as optimized WebP fallbacks: fighter = worn steel/leather, warlock = charred parchment, cleric = cathedral ash-light, druid = bark/moss, bard = ebony/gold strings, paladin = ruined shrine, sorcerer = midnight archive, wizard = veined arcane stone, rogue = black leather/poison green, monk = ascetic monastery stone, barbarian = charred leather/embers, artificer = iron/brass workshop, ranger = shadowed forest frontier;
- built-in backgrounds are isolated in `character-sheet-backgrounds.css` and keyed only by the canonical class key; unknown classes continue to render the neutral graphite fallback;
- every background is decorative and continuous beneath the sheet rather than repeated inside individual cards;
- the UI background keeps the source 9:16 composition at `100% auto` so long sheets fade back into graphite instead of stretching one texture across several screens;
- the class palette is now derived from its actual background material rather than from a generic class stereotype: canvas, raised canvas, three translucent surface levels, divider hierarchy, primary accent, spell accent, resource accent and the background wash all move together;
- the palette remains intentionally graphite-first. Text tiers remain shared across classes for accessibility, while class identity lives in material tint, accents, icons and the underlay;
- panel opacity was reduced enough for the art to participate in the composition while keeping spell/resource states and Snake affordances readable;
- semantic media slots remain `class:<classKey>:resource`, `class:<classKey>:spell_slot` and `class:<classKey>:sheet_background`;
- Supabase remains the runtime override layer: an active private-media binding for `class:<classKey>:sheet_background` wins over the built-in fallback through the existing reference-media pipeline;
- there are currently no active class sheet-background bindings in Supabase, so the authored built-in set is what renders by default;
- server authorization for future background replacement remains owner/admin-only; GM/player permissions were not widened;
- no Character Engine mechanics, resource state schema or spell preparation path changed as part of the visual stage;
- the original multi-megabyte source images are not shipped as-is: the built-in fallback set is mobile-optimized before embedding in the UI.

### Stage 13 — Admin media editing [DONE]
- long press remains the single contextual entry point: normal tap behavior for resources, spell slots and the portrait is unchanged;
- portrait Snake media tools continue to edit character avatar (1:1 circle), panel avatar (3:1) and dedicated sheet hero (16:9), with saved crop/presentation restored when reopening the editor;
- dedicated character-media reset actions now remove the active binding safely: sheet hero falls back to panel/avatar, panel falls back to avatar, and avatar returns to its unbound state;
- the old server/frontend mismatch was fixed: `list_character_media_presentations_v1` now returns `sheet_hero`, so a dedicated sheet image actually survives reload;
- owner/admin gets a new `Оформление листа` Snake branch from the character portrait for class background, class-resource icon and class spell-slot icon;
- class background upload/replace/reset uses the stable `class:<classKey>:sheet_background` binding and the 9:16 Snake crop editor; saved crop is now consumed by CharacterSheetShell instead of being stored and ignored;
- class resource upload/replace/reset uses `class:<classKey>:resource`;
- class spell-slot upload/replace/reset uses `class:<classKey>:spell_slot`;
- long press on an individual resolved resource can additionally set an exact `resource:<state_key>` override;
- resource visual precedence is exact resource override → class resource override → built-in Stage 12 PNG;
- spell-slot visual precedence is class override → built-in Stage 12 PNG;
- reset does not delete the uploaded media object: it safely deactivates the binding through `unbind_media_presentation_v1`, allowing the built-in/lower fallback to become active again;
- icon uploads are registered as `icon / tiny_icon` media and PNG uploads preserve PNG encoding/transparency even when browser-side resizing is required;
- backgrounds continue through `panel`, portraits through their existing portrait/panel/hero profiles, and no parallel storage system was introduced;
- server permission guard now recognizes class resource/spell-slot and exact resource media slots while keeping those reference-art mutations owner-only;
- `unbind_media_presentation_v1` is callable by authenticated users but re-authorizes every request through `auth.uid()` + `private.can_attach_media_target`; anonymous execution is explicitly revoked;
- campaign members may read the resulting reference media through the existing `private.can_read_media_asset` path, but GM/player permissions were not widened for owner-only class/reference editing;
- Character Engine, resource state, spell preparation and gameplay mechanics are untouched by this stage.

### Stage 14 — Standalone Inventory boundary [DONE]
- Inventory remains a dedicated full-interface mode and never renders inside the normal Character Sheet content area;
- this stage intentionally does NOT implement the inventory itself: spatial grid, bags, equipment, drag/drop, holder navigation and inventory mechanics move to the separate Inventory roadmap;
- the current Inventory screen remains an explicit placeholder instead of resurrecting any legacy inventory UI;
- the placeholder owns a reserved future mount surface so the real inventory can replace the body without changing CharacterView routing or the Character Sheet shell;
- CharacterView history now persists `focusedItemId` together with the Inventory interface snapshot, so browser / Android back-forward can restore the exact item target instead of only reopening the generic Inventory screen;
- old history entries without `focusedItemId` remain compatible and safely resolve to no focused item;
- entering Inventory from the right rail clears stale item focus; entering through entity navigation stores the exact item id;
- changing the focused item while Inventory is already open updates the current history snapshot instead of stacking another navigation entry;
- returning from Inventory clears live item focus while browser-forward can restore it from the stored Inventory snapshot;
- Character Sheet AI/Snake context explicitly publishes `inventoryInterfaceStatus: placeholder` and `inventoryImplementationRoadmap: inventory-separate`, preventing the agent from treating unimplemented grid/equipment actions as live UI;
- the executable UI contract records `status: placeholder`, `implementationRoadmap: inventory-separate`, the state that must survive navigation, and the future capabilities reserved for the separate Inventory project;
- the standalone screen continues to inherit the same graphite/class-skin foundation, safe-area spacing and dedicated back control;
- no inventory engine, Supabase inventory schema, Cheburashka mechanics, item placement rules or drag/drop behavior changed in this stage.

### Stage 15 — Sorting/data certification [DONE]
- certification was run against current project data instead of synthetic-only fixtures: 11 characters, 15 template assignments, 14 legacy features and 79 legacy spell rows were present at the audit snapshot;
- the dataset contains a real multiclass character with two class assignments and two subclass assignments, so class/subclass provenance was verified against an actual mixed-source case rather than inferred from single-class data;
- the legacy spell dataset currently covers every D&D spell level from 0 through 9 and contains no rows outside that range;
- active template mechanics also exercise all three CE preparation modes: `prepared`, `always_prepared` and `not_required`;
- one active custom class template currently lacks catalog-level `source_kind/source_label`; Stage 15 deliberately does not rewrite user data to make the audit pass;
- template-backed provenance remains trustworthy through template kind/id even when optional catalog source metadata is absent; genuinely unknown non-template CE sources fall into `Прочее` instead of being guessed;
- Character Runtime snapshots now expose resolver-owned `TemplateSourceNode[]`, preserving exact source-node `unlockLevel` metadata from `rule_template_levels` and structured choice sources;
- Features consumes those runtime source nodes and now fulfills the documented sort order: category → concrete source → timing → unlock level → name;
- features with no known unlock metadata sort after known levels instead of receiving a fabricated level;
- multi-source resolved grants/actions no longer depend on whichever provenance entry happened to be first: source candidates are classified deterministically, all source names are retained for detail, and the dedupe identity uses a stable sorted provenance signature;
- resolved template provenance remains grouped under the actual class/subclass/race template name; legacy `class_feature` and `racial_trait` retain their trustworthy manual category, while unknown legacy/general sources remain `Прочее`;
- spell preparation state was corrected for multiclass access: `always_prepared` wins first, then an actually prepared access, then any `not_required` access, and only then an unprepared prepared-access state;
- therefore a spell available spontaneously from one source is no longer falsely labelled `Не подготовлено` merely because another class access to the same spell is currently unprepared;
- prepared-first sorting is now binary as specified: prepared/always-prepared spells come first when the character has a preparation workflow, then all remaining spells sort alphabetically; the UI no longer invents an extra ranking between spontaneous and unprepared spells;
- the `ПОДГОТОВЛЕНЫ` filter is only rendered when the resolved character actually has at least one mutable prepared access, avoiding a dead filter for fully spontaneous casters;
- spell access source names are deduplicated and sorted deterministically; rows show a compact two-source summary with `+N` for larger multiclass/source sets while Snake detail retains the full list;
- spell school values are normalized case-insensitively before filtering/presentation so dirty casing does not split one school into multiple filter options;
- resolved spell levels are no longer silently clamped into 0 or 9: standard 0–9 levels keep the canonical groups, while any future non-standard CE level is surfaced under `ПРОЧЕЕ` with its real numeric level instead of being misrepresented;
- the sheet still treats CE as authoritative: this certification changed renderer metadata/sorting only and did not create a second preparation or spell-state owner;
- critical renderer rules were extracted into the pure `characterSheetDataCertification.ts` module; Features and Spells call those same functions, so behavioral tests exercise production sorting/preparation helpers rather than duplicate test-only logic;
- `tests/characterSheetStage15Certification.test.ts` guards runtime unlock-level propagation plus component integration with the shared helpers;
- `tests/characterSheetStage15Behavior.test.ts` adds isolated behavioral coverage for mixed preparation access, prepared-first ranking, preparation-workflow detection, school normalization, source-name cleanup, hostile summary limits, exact 0–9 level validation, order-independent provenance signatures, deterministic primary-source selection, full feature comparator precedence and invalid/unknown unlock levels;
- unlock-level cleanup now rejects non-integer, zero, negative, NaN and infinite values instead of allowing dirty metadata to sort before legitimate class levels;
- source-summary compaction clamps invalid/non-positive visible counts to at least one source, so malformed presentation input cannot produce an empty prefix such as ` · +3`;
- Supabase was audited read-only for this stage; no project data, spell preparation state or template metadata was mutated merely to satisfy certification.

### Stage 16 — Mobile certification
- 320 / 360 / 390 / 430 widths;
- Telegram safe areas;
- Android back;
- nested-scroll conflicts;
- long press vs scroll;
- Snake;
- state restoration after Inventory;
- remove later obsolete character-sheet CSS only after its replacement is certified. The pre-redesign character-view.css was intentionally removed in Stage 2.

## Non-goals for Stage 1

Stage 1 does not:
- change layout;
- implement new routes;
- change Character Engine;
- change inventory mechanics;
- add database schema;
- invent final icons;
- merge to main.
