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

Future admin-only long press can replace:
- sheet portrait;
- global sheet icons;
- class spell-slot PNG;
- unique resource PNG.

Players can read the bound assets but cannot edit them.
Authorization must be enforced server-side, not only by hiding buttons.

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

### Stage 6 — Overview
- class resources;
- compact spell-slot preview;
- only important/frequent features and protections.

### Stage 7 — Features mode
- source grouping;
- timing sorting;
- no flat feature dump;
- tap = detail / primary action;
- long press = Snake.

### Stage 8 — Spells mode
- cantrips + levels 1..9;
- prepared-first when relevant;
- alphabetical inside groups;
- compact filters;
- Snake detail/actions.

### Stage 9 — Spell-slot linkage
- Overview slot tap opens Spells;
- focus/scroll to the tapped spell level;
- class-specific visual accent contract.

### Stage 10 — Entity navigation
- feature/resource/spell/item/effect links resolve to the correct entity and view;
- no ad-hoc per-component navigation spaghetti.

### Stage 11 — Snake UI context
- keep current section/entity context synchronized with AI context;
- actions respect player/GM/admin authority.

### Stage 12 — Visual assets
- neutral placeholders now;
- later PNG replacement without layout changes;
- class spell slot art + unique resource art.

### Stage 13 — Admin media editing
- long press → Snake media actions;
- upload/replace/reset;
- PNG transparency preserved;
- portrait supports crop/presentation.

### Stage 14 — Standalone Inventory interface
- inventory no longer renders as a normal sheet section;
- spatial grid, bags, equipment and drag/drop remain separate;
- uses same graphite visual foundation.

### Stage 15 — Sorting/data certification
- dirty real data;
- multiclass;
- missing source metadata;
- prepared/non-prepared casters;
- 0–9 spell levels;
- fallback "Прочее".

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
