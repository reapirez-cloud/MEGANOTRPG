# MEGANOT UI 1.0 — Stage 3 Home visual direction

> Date: 2026-09-12
>
> Status: IMPLEMENTED FIRST PASS ON `dev` — **HISTORICAL STAGE RECORD**
>
> Home v3 decisions below remain the basis of the current Home, but implementation status, terminology and next-step ordering are owned by `docs/UI_V1_CURRENT_STATE_2026-09-13.md`.

This stage fixes the first real visual direction for Home.

Decisions confirmed with the product owner:

- global Dock order is **Я / Главная / Чаты**;
- proportions target **25 / 50 / 25** with Home as the visual center;
- section names live directly on top of the preview artwork;
- section text must remain readable for arbitrary artwork, so readability is a system responsibility, not an asset requirement;
- every Section Preview owns a dark lower scrim, text shadow and high-contrast white title;
- Home is atmospheric and image-led, not a dashboard grid;
- major entries have unequal visual weight;
- "Что нового" and "Мир" are dominant;
- "Новости общества", "Достижения", "Арты", "Обновления" are smaller paired previews;
- "Последние события" excludes art feed items so uploads cannot bury meaningful campaign activity;
- campaign cover can temporarily act as the World preview image; individual section artwork can be wired later without changing the SectionPreview contract.

This is the first coded visual direction, not a claim that final art, typography, spacing or image selection can never change.

Important: unfinished Home sections receive their own routes rather than secretly redirecting to unrelated legacy screens.


## Incremental connection rule

Deferred root spaces use explicit placeholders in the new shell.

At this stage:
- `/home` is the active UI 1.0 implementation;
- `/chats` is connected through a UI 1.0 placeholder until the Chats stage;
- `/workspace` ("Я") is connected through a UI 1.0 placeholder until the Workspace stage;
- legacy/deep screens remain compatibility bridges only where working behavior still needs to survive;
- working legacy root surfaces are preserved explicitly at `/legacy/chats` and `/legacy/workspace`, never through the new Dock.

Do not mount deferred legacy root UIs inside the new shell just to avoid an empty destination.


## Home v2 — mixed-content composition

> Decision update: 2026-09-12

The first Home pass made every destination a large image tile. That made the page vertically heavy and pushed the product back toward a generic card/dashboard rhythm.

The active Home direction is now:

- **«Что нового»** is the only true hero entry and may use the latest event media, falling back to campaign cover;
- **«Мир»** remains visual but is substantially shorter than the hero and uses the campaign cover when available;
- **«Новости общества»** is an editorial text entry, not a tile;
- **«Достижения»** is a compact editorial entry with the real campaign achievement count and latest title;
- **«Арты»** is represented by a small strip of the latest real gallery images rather than another large card;
- **«Последние события»** moves below the main destinations and becomes a compact chronology preview;
- **«Обновления» are removed from Home entirely.** The stable route may remain for future relocation, but application changelog/update tracking is not treated as a primary player destination.

Home should no longer be composed from one reusable tile shape with decorative filler. Each entry type should express the nature of its content.


## Home v3 — World first, chronology only once

> Decision update: 2026-09-12

The «Что нового» hero was removed after live review. It consumed too much vertical space without a distinct job and duplicated the same chronology already exposed by «Последние события».

The active Home order is now:

1. **«Мир»** — first and primary visual destination, deliberately restrained in height;
2. **«База знаний»** — compact dedicated entry for rules, items, spells and bestiary;
3. **«Новости общества»** — editorial row;
4. **«Достижения»** — compact campaign-history row;
5. **«Арты»** — small live gallery strip;
6. **«Последние события»** — compact chronology preview, with «Все» as the single Home entry into the full chronology.

«Что нового» remains a real deep chronology screen, not a Home tile. «Обновления» remain absent from Home.


## World preview artwork

> Asset update: 2026-09-12

The approved coastal grimdark panorama is now the campaign artwork used by the Home «Мир» entry. The source upload was reduced to a 640×213 WebP derivative at `public/ui-v1/world/world-preview.webp` (about 21 KB), which is sufficient for the mobile Home preview while avoiding a multi-megabyte image payload. The UI continues to read this through the campaign `cover_url` contract rather than hardcoding a special-case image into `WorldPreview`.
