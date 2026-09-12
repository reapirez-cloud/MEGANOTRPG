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

The central Home space is visually dominant. Root spaces also support deliberate horizontal swipe navigation.

Current status:

- **Главная** — implemented;
- **Я / Workspace** — UI 1.0 placeholder;
- **Чаты** — UI 1.0 placeholder.

The avatar on Home currently routes to Workspace. A richer Personal Reveal remains a future interaction pattern, not a currently implemented primitive.

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

**Snake is planned and documented, not implemented.**

Canonical contract: `docs/SNAKE_INTERACTION_CONTRACT.md`.

The existing Zone long-press/context action implementation is temporary and must not be copied. Snake is intended to centralize long press/right click, one-gesture/one-invocation handling, viewport-aware context menus, reusable Confirm/Editor/Picker/Detail/Notice/Placeholder surfaces and typed dispatch into GENA/Oracle/explicit-owner paths.

Planned proof sequence remains:

1. Snake core/provider/trigger/context menu;
2. migrate Locations and delete their local long-press runtime;
3. use Inventory as the second unrelated entity family proving Snake is generic;
4. add further universal surfaces only when real flows require them.

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
E. Snake interaction runtime              NEXT major architecture stage
F. Inventory as Snake proof #2            AFTER Snake/Location migration
G. Workspace: Player + GM                 AFTER interaction foundation
H. Character UI / Sheet / Inventory UI    AFTER Workspace foundation
I. Chats UI 1.0                           DEFERRED
J. remaining surfaces + atmosphere/polish DEFERRED
```

Do not start a heavy Workspace/Character/Inventory redesign by creating local context menus and modal families before Snake exists.

## Intentional placeholders are not bugs

Intentionally deferred at this snapshot:

- Workspace UI 1.0;
- Chats UI 1.0;
- Map UI;
- dedicated Art/gallery UI 1.0;
- many entity detail/editor/create flows;
- Personal Reveal;
- final atmospheric application background;
- full shared interaction foundation required by Snake.

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
