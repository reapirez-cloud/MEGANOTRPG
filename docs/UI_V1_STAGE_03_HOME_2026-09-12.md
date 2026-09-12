# MEGANOT UI 1.0 — Stage 3 Home visual direction

> Date: 2026-09-12
>
> Status: IMPLEMENTED FIRST PASS ON `dev`

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
