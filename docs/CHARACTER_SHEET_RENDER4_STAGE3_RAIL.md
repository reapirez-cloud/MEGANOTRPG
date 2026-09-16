# Character Sheet · Render 4 · Stage 3 Navigation Rail

Stage 3 locks the right-side navigation rail shown over the hero.

## Visual contract

- The rail stays directly on the hero artwork. No opaque card is introduced.
- Exactly three rows are visible at once.
- Every row uses an authored inline SVG symbol rather than placeholder glyphs.
- Current entries:
  1. Умения
  2. Заклинания
  3. Биография
  4. Инвентарь
- Thin class-tinted separators and circular icon vessels match the approved
  render without turning the rail into a detached sidebar.
- Active state is intentionally restrained: a faint class tint and brighter
  icon/text, not a filled button.

## Scroll contract

- Additional rows scroll inside the rail and never increase hero height.
- Vertical scroll-snap is mandatory per row.
- Native touch scrolling is used; no gesture library is required.
- touch-action is vertical-only and the rail does not rely on a gesture from the
  screen edge, avoiding Telegram/Android back-gesture conflict.
- Overscroll is contained inside the rail.
- When a section becomes active programmatically, it is brought into the
  visible three-row window without scrolling the whole character sheet.
- Reduced-motion preference disables smooth programmatic scrolling.

## Accessibility

- The rail exposes an explicit navigation landmark.
- The active section uses aria-current="page".
- Keyboard focus receives a visible class-tinted focus ring.

## Out of scope

Stage 4 owns the 50/50 characteristics glass panel.
Stage 5 owns class resources and spell slots.
Stage 6 owns pixel QA across target viewport widths and Telegram Android.
