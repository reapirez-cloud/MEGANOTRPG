# Character Sheet · Render 4 · Stage 6 Pixel QA

Stage 6 is the final certification pass for the Render 4 character sheet.

## Certified viewport widths

The mobile surface is exercised at:

- 360 CSS px
- 390 CSS px
- 412 CSS px

The sheet must not create horizontal page overflow at any certified width.

## Hero and rail

- Hero height follows the width-driven Render 4 contract.
- The identity block never collides with the right navigation rail.
- Long character names remain a single ellipsized line inside the identity zone.
- The right navigation rail exposes exactly three visible rows while remaining
  independently scrollable for additional destinations.

## Core

- The characteristics surface remains one shared class-tinted glass panel.
- Left and right halves remain within 2 CSS px of equal width.
- Expanded ability state stays inside the right half and does not create a new
  screen or detached card.

## Resources and spell slots

- Resource and spell-slot panels remain narrower than the core so the class
  background remains visible around them.
- Authored class PNGs remain the source for resource and spell-slot visuals.
- Spent icons keep the same PNG, become grayscale, and receive the authored red
  cross as an overlay.
- Spell slots expose four icon columns.
- Exactly four spell-level rows fit in the internal slot viewport.
- A nine-level certification case must overflow and scroll vertically.
- Spell-slot overscroll remains auto so the parent sheet can resume scrolling
  at the nested viewport edge.

## Class skins

The final certification iterates all prepared class keys:

fighter, warlock, cleric, druid, bard, paladin, sorcerer, wizard, rogue, monk,
barbarian, artificer, ranger.

Each must expose both its class accent variables and built-in background fallback.

## Runtime coverage

Playwright covers:
- target widths,
- long-name overflow,
- hero/rail separation,
- 50/50 core proportions,
- resource and slot widths,
- four-row slot viewport,
- nine-level nested scrolling,
- spent icon grayscale + red-cross overlay,
- all 13 class skins,
- rail nested scrolling.

The existing Telegram mobile suite continues to cover safe areas, native Back,
history restoration, Snake long-press cancellation and scroll hand-off.

## Release boundary

Stage 6 certifies the Render 4 implementation in dev. It does not merge dev into
main and does not trigger a production release. Main remains a separate release
decision.
