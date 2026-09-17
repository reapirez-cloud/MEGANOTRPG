# Character Sheet · Render 4 · Stage 3 Navigation Rail

Stage 3 locks the right-side navigation rail shown over the hero and aligns its content order with the approved header reference while preserving MEGANOT's own skin.

## Visual contract

- The rail stays directly on the hero artwork. No foreign reference styling is copied.
- Exactly three rows are visible at once on the mobile target; the remaining rows scroll inside the rail.
- Every row uses an authored inline SVG symbol rather than placeholder glyphs.
- Canonical order is:
  1. Персонаж
  2. Умения
  3. Заклинания
  4. Владения
  5. Биография
  6. Инвентарь
- `Персонаж` maps to the existing Overview section.
- `Инвентарь` keeps the existing dedicated full-interface boundary.
- `Владения` is a real sheet section in navigation/history. Its detailed content layout is intentionally separate from this rail stage.
- Thin class-tinted separators and circular icon vessels stay part of MEGANOT's existing visual language.
- Active state remains restrained: a faint class tint and brighter icon/text, not a filled button.
- Known labels must fit on one line. In particular `Заклинания` must not wrap, ellipsize or clip at 360/390/412 CSS px.

## Scroll contract

- Additional rows scroll inside the rail and never increase hero height.
- Vertical scroll-snap is mandatory per row.
- Native touch scrolling is used; no gesture library is required.
- `touch-action` is vertical-only and the rail does not rely on a gesture from the screen edge, avoiding Telegram/Android back-gesture conflict.
- Overscroll is contained inside the rail.
- When a section becomes active programmatically, it is brought into the visible three-row window without scrolling the whole character sheet.
- Reduced-motion preference disables smooth programmatic scrolling.

## Data boundary

Supabase already exposes character-sheet fields for `proficiencies`, `languages`, `senses`, `saving_throw_proficiencies` and `skill_proficiencies`. Stage 3 does not add or migrate database state. It only reserves and routes the `Владения` surface; detailed presentation of those values belongs to the later content pass.

## Accessibility

- The rail exposes an explicit navigation landmark.
- The active section uses `aria-current="page"`.
- Keyboard focus receives the existing visible class-tinted focus treatment.

## Acceptance

- Six labels exist in the exact canonical order.
- Three rows remain visible at a time on mobile and the rest are reachable by internal vertical scroll.
- `Заклинания` is fully readable without wrapping or ellipsis at 360/390/412 CSS px.
- Selecting `Персонаж` returns to Overview.
- Selecting `Владения` creates a real internal history state and Back returns to Overview.
- Selecting `Инвентарь` still opens the standalone inventory interface.
- No Supabase schema/data mutation is required for this stage.
