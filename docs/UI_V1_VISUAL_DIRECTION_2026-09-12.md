# MEGANOT UI 1.0 — visual direction v1

> Date: 2026-09-12
>
> Status: **HISTORICAL / PARTIALLY SUPERSEDED DESIGN DIRECTION**
>
> This file preserves the first visual direction from 12 September 2026. The low-chroma palette, isolated-UI principle and three-part dock remain useful direction, but the Home composition and destination list below are historical where they conflict with current code.
>
> **Current authority:** `docs/UI_V1_CURRENT_STATE_2026-09-13.md` + actual UI 1.0 code. In particular, the old dominant `Что нового` Home preview is no longer the current Home structure.

The new UI is designed from scratch and remains physically isolated from the legacy application.

## Palette

The base system is deliberately low-chroma:

- canvas: near-black graphite;
- surfaces: charcoal and steel grays;
- secondary warm stone gray for selected depth;
- text: warm off-white instead of pure white;
- muted text: neutral steel gray.

No purple/blue/green decorative gradient is part of the default product language.

## Composition

Home is editorial, not dashboard-like:

- unequal visual weight;
- one dominant "Что нового" preview;
- a large "Мир" preview;
- asymmetric paired secondary previews;
- titles live directly on previews;
- built-in scrim guarantees readable labels on future artwork;
- no icon grid.

## Navigation

Bottom dock remains:

`Я 25% / Главная 50% / Чаты 25%`

## Placeholder contract

Every destination is wired before implementation.

Current stable destinations:

- `#/home/whats-new`
- `#/home/world`
- `#/home/society-news`
- `#/home/achievements`
- `#/home/art`
- `#/home/updates`
- `#/workspace`
- `#/chats`

Until a destination is actively designed, it renders the shared UI 1.0 placeholder and never mounts a legacy page.

## Figma

The design source is the separate file:

`MEGANOT UI 1.0 — New Interface`

The first start-page direction is kept there as the visual reference before deeper screens are implemented.
