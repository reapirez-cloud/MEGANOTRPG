# MEGANOT UI 1.0 — current state

> Date: **2026-09-13**
>
> Status: **CANONICAL CURRENT STATE — READ BEFORE UI 1.0 WORK**
>
> This document answers one question: **what is true in the redesign right now?**
>
> It is intentionally different from historical stage notes. Stage/plan documents explain how decisions evolved. This file records the implementation state that a future agent should start from.

## Authority / precedence

For UI 1.0 work, use this order when sources disagree:

1. current code and database schema;
2. `AGENTS.md` and named-engine contracts;
3. this current-state document;
4. the newest focused stage/contract document that does not conflict with the above;
5. older redesign plans/stage notes as historical context only.

Do not resurrect an older UI structure because an older Markdown file says it once existed.

## Entrypoints and isolation

Current application entrypoints:

```text
index.html -> src/ui-v1-isolated/main.tsx -> UI 1.0
legacy.html -> src/main.tsx -> src/App.tsx -> legacy application
ui-v1.html -> compatibility alias to UI 1.0
```

The hard-isolation rule remains active: UI 1.0 does not import legacy page/component/style trees as its visual foundation. Real shared business/data logic may be connected through explicit adapters.

## Global navigation

Root spaces are:

```text
Я | Главная | Чаты
25%   50%    25%
```

The central Home space remains wider in information hierarchy, but the earlier tall raised-center dock geometry is superseded. The current visual direction is a **maximally slim translucent glass rail** that preserves space for PNG navigation artwork without obscuring reading content underneath. Home may be wider, but should not rise into a large crown/bulge.

Root spaces also support deliberate horizontal swipe navigation.

Current status:

- **Главная** — implemented;
- **Я / Workspace** — implemented first identity-space pass;
- **Чаты** — UI 1.0 placeholder.

The top-right `VI` circle is reserved for the future player profile and no longer routes to Workspace. Profile UI remains deliberately unimplemented.

## Current visual language decision — 2026-09-13

The baseline UI direction is **dead cold light** rather than warm graphite/gold gothic ornament.

Core rule:

- global MEGANOT chrome stays coherent: graphite / iron / cold steel / pale bone;
- sparse cold glow is allowed as part of interaction and hierarchy;
- campaign artwork may contribute local color without recoloring the application shell;
- semantic danger/status colors remain local signals, not themes;
- class surfaces are the intentional future exception: each class may temporarily override scoped accent/light tokens to express its own character while preserving the MEGANOT shell, structure, typography and navigation;
- leaving class context restores the normal app palette.

Do not create per-section themes merely for variety.

The current Society News composer is a temporary first-pass modal and is not a visual reference for Snake windows.

## Workspace / Я — current composition

`Я` is the current campaign identity surface, not an account dashboard.

- player: GM-assigned active PC is the large bottom artwork board;
- `Персонажи игроков` is a collapsible view-only shelf of the **living active PCs of other campaign members**; tapping one opens that character but never selects it as the current voice;
- `Мои персонажи` contains PCs assigned to the current user. Living characters stay first; dead owned characters remain visible and are automatically sorted to the bottom;
- GM/owner: `Рассказчик` remains available as a speaking identity; manager authority does **not** grant the right to take another player's assigned character as a Workspace voice;
- manager speaker candidates are restricted to the current user's living assigned characters plus living unassigned NPCs. Unassigned PCs and characters assigned to another user stay out of the Workspace voice picker and belong to management/workshop flows;
- GM voice selection is separate from `campaign_members.active_character_id`, persists only as UI/session state, and is revalidated against the protected speaker pool on load so stale local state cannot reclaim another player's character;
- tapping an active character board enters the stable future character-view route;
- managers get a 70/30 campaign / `Управление` strip above the active board;
- character-view and management destinations remain isolated connection seams and do not fall back to legacy UI.

## Home — current composition

Current Home order is:

1. **Мир** — primary visual entry;
2. **База знаний**;
3. **Новости общества**;
4. **Достижения**;
5. **Арты**;
6. **Последние события**.

`Что нового` is the full deep chronology screen and is entered through `Последние события -> Все`. It is not a duplicate Home hero.

`Обновления` is not a Home destination. Its stable route may remain for future relocation/compatibility, but it is not part of the current Home composition.

Home reads real Supabase data for campaign identity/cover, chronology, art previews, achievements and society announcements. Realtime is a refresh signal, not canonical storage.

## World — canonical player-facing terminology

The current user-facing World vocabulary is **Локации / Персонажи / Лор / Карта**:

```text
Мир
├─ Локации
├─ Персонажи
├─ Лор
└─ Карта
```

Terminology rule:

- **Локации** is the player-facing word. Technical storage/engine names remain `locations`.
- **Персонажи** is the player-facing World label for characters who inhabit the world. The stable subsection id may remain `characters`, and the current storage filter may still use `character_type = npc`.
- **Игроки** is the player-facing term for PCs / player-controlled characters in party/workspace management surfaces.
- `NPC`, `PC`, `zone` and similar shorthand may remain in code, contracts and data fields where technically useful, but should not be the default immersive UI vocabulary.

Current World status:

- hub — implemented;
- Locations hierarchy/navigation — implemented first pass;
- World Characters list — implemented first pass; technically filtered to non-player characters;
- Lore list — implemented first pass;
- Map — intentional placeholder until its own design stage;
- dedicated detail/edit/create interfaces — deferred unless explicitly designed.

## Knowledge Base

Current hub is data-driven. Present entries include spells, classes, invocations, bestiary and deferred/reference placeholders. Existing real catalogs are used where available. Unknown/new subsection routes degrade to clean UI 1.0 connection placeholders rather than legacy screens.

## Chronology, Society News and Achievements

- **Что нового / chronology** — real non-art campaign chronology with progressive loading and stable future source slots;
- **Новости общества** — reads `campaign_updates(kind = announcement)`; manager publication follows `UI -> Oracle -> Larisa -> campaign_updates`;
- **Достижения** — real campaign achievement list, first-pass presentation;
- **Арты** — Home preview is live; the dedicated new gallery surface is still deferred.

## Named-engine write boundary

Reads may use isolated UI data adapters against Supabase under RLS.

Canonical mutations must follow the owner/control-plane architecture:

```text
normal gameplay
UI -> GENA (when orchestration is required) -> owner -> canonical state

GM mutation
GM UI -> Oracle -> explicit owner -> canonical state
```

For current redesign surfaces:

- descriptive campaign/world chronology, locations, links, sections and NPC habitats -> **Larisa**;
- characters/runtime character state -> **Shapoklyak**;
- inventory instances -> **Cheburashka**;
- reusable definitions -> **Chasovoy**.

React must not directly write canonical GM state merely because RLS would allow the query.

## Snake — current status

**Snake core is implemented and Locations are migrated to it.**

Canonical contract: `docs/SNAKE_INTERACTION_CONTRACT.md`.

Current implementation includes:

- `src/snake-engine/**` generic action/entity/result contracts;
- modular UI runtime: orchestration/context, interaction/gesture handling and reusable surfaces are split under `src/ui-v1-isolated/snake/**` so adding entity families does not grow one provider monolith;
- one UI 1.0 `SnakeProvider` and reusable `SnakeTrigger`;
- dynamic Branch/Command navigation with a transient branch stack: the domain resolves only the current level's children, Back restores the previous level, and terminal commands receive the selected path;
- right-click + touch long-press with synthetic Telegram/Android contextmenu suppression;
- viewport-aware universal floating context menu;
- one Snake-owned adaptive universal window system: Placeholder / Confirm / Editor / Picker / Detail / Notice/Error / Flow; windows support controlled compact-to-full sizing and Flow steps accumulate one transient draft before final dispatch;
- domain-provided typed executors rather than a generic arbitrary engine RPC;
- Location actions supplied by `locationSnakeActions.ts`, outside Snake;
- the old LocationNavigator local timer / inline menu removed.

Window ownership rule: universal windows are **surfaces of Snake**, not a separate agent. The flow is `domain action -> Snake surface -> user input -> Snake executor -> GENA / Oracle / approved owner`.

Location CRUD interfaces that have not yet been designed still open Snake Placeholder. The next architecture proof is **Inventory as the second unrelated entity family**.

## Foundation note — do not trust the old Stage 2 capability list

`docs/UI_V1_STAGE_02_FOUNDATION_2026-09-12.md` is historical.

The current isolated entry does **not** mount the earlier claimed `MotionConfig`, `LayerHost`, Meganot Radix wrappers or a recovered shared motion/material foundation. Dependencies such as Motion/Radix may exist in `package.json`, but dependency presence is not implementation.

Future foundational primitives needed by Snake or later UI must be implemented in the isolated tree and verified there. Do not import the old/legacy visual graph to recreate them.

## Current redesign sequence

```text
A. UI 1.0 shell/isolation                 DONE
B. Home                                   DONE first production pass
C. chronology/basic content sections      DONE / partial by section
D. World                                  PARTIAL, usable first pass
E. Snake interaction runtime              DONE core + Locations proof #1
F. Inventory as Snake proof #2            NEXT architecture proof
G. Workspace identity shell                DONE first pass, pulled forward by explicit design decision
H. Character UI / Sheet / Inventory UI    AFTER Workspace foundation
I. Chats UI 1.0                           DEFERRED
J. remaining surfaces + atmosphere/polish DEFERRED
```

Do not create local context menus or modal families beside Snake. New entity families should add action providers and reuse Snake surfaces.

## Intentional placeholders are not bugs

Intentionally deferred at this snapshot:

- Workspace management deep screen;
- Workspace character-detail / new Character UI;
- Chats UI 1.0;
- Map UI;
- dedicated Art/gallery UI 1.0;
- many entity detail/editor/create flows;
- Personal Reveal;
- final atmospheric application background;

A placeholder is acceptable only when it preserves the final route/connection seam and does not fake persistence or silently embed legacy UI.

## Historical documents

Useful as decision history, not current capability truth:

- `REDESIGN_STAGE_2026-09-12_UI_FOUNDATION.md`;
- `REDESIGN_PLAN_01_APP_SHELL_AND_HOME.md`;
- `UI_V1_STAGE_02_FOUNDATION_2026-09-12.md`;
- `UI_V1_STAGE_03_HOME_2026-09-12.md`;
- `UI_V1_HARD_ISOLATION_2026-09-12.md`;
- `UI_V1_VISUAL_DIRECTION_2026-09-12.md` (palette/isolation direction still useful, old Home composition superseded).

`CHARACTER_UX_REDESIGN_AUDIT.md` is **deferred future-stage design input**, not a historical dead document and not the current implementation queue. Use it when the sequence reaches Workspace/Character work.

Focused engine/interaction contracts such as `SNAKE_INTERACTION_CONTRACT.md` remain authoritative for their specific boundaries unless explicitly superseded later.


## GM Workshop / `Я → Управление` — current implementation

This surface is now real UI 1.0, not a placeholder.

### Root destinations

The Workshop root is intentionally **not** a tab bar. It presents five work destinations in this order:

1. **Черновик** — GM-only safe authoring zone.
2. **Партия** — members, invitations, assignment and active-PC control.
3. **Персонажи** — one searchable PC + NPC catalog.
4. **Библиотека** — reusable campaign definitions.
5. **Материалы** — private GM notes, folders and uploads.

The old `GmWorkspace.tsx` may be consulted only for working behavior that has not yet been ported. Its visual grammar, five-tab navigation, PC/NPC split tabs, sheets and old `Только я` concept are not visual/product donors for UI 1.0.

### Draft law

`characters.publication_state` is the canonical character authoring lifecycle:

- `draft`: GM-only, unassigned, private, cannot become active, absent from ordinary `Я` and `Мир` reads.
- `campaign`: published into campaign state; PC assignment and active selection remain separate later actions.

Publishing an NPC requires choosing either:

- `discover` — players learn it through the existing discovery/encounter relation.
- `always` — immediately visible as a known world character.

This is not the legacy `visibility = private` / «Только я» feature. Do not collapse these concepts again.

### Party law

PC ownership and active identity are deliberately separate:

`publish PC → assign to member → optionally make active`

Assignment must never silently call `set_campaign_active_character`.

Dead characters remain historical catalog entries and cannot be active.

### Library law

Campaign-authored item/spell/feature/effect definitions live in Chasovoy:

`draft → active → archived`

Issuing an active definition creates runtime state through its canonical owner path via Oracle, not by turning the definition row itself into a character instance.

### Materials law

GM materials remain private per `campaign_id + workspace_user_id` and keep the existing private `campaign-media` Storage path. Upload deletion must remove both the database row and its Storage object.
