# Character Sheet · Render 4 · Stage 1 Geometry

Reference: approved fourth render, 941 × 1672 px.

This stage locks layout geometry only. Art direction, final glass treatment,
authored navigation icons, typography polish and pixel QA belong to later
roadmap stages.

## Width-driven targets

- sheet inline inset: ~3.7% of viewport width
- hero height: 61.4% of viewport width
- identity left anchor: ~12.8% of viewport width
- navigation rail top: ~30.7% of viewport width
- navigation rail width: ~31.5% of viewport width
- navigation viewport: exactly 3 rows visible; additional rows scroll inside it
- core/stat block: full sheet width inside the common inset
- resource panel width: 68% of content width
- spell-slot panel width: 80% of content width
- overview vertical gap: ~1.9% of viewport width

## Interaction geometry

The whole sheet remains the primary vertical scroller.

The hero navigation rail is an independent vertical scroller with three visible
rows and scroll-snap. It uses a vertical touch axis and contained overscroll, so
it does not require an edge gesture and does not depend on Telegram's back
gesture.

Spell-slot rows remain an internal vertical viewport when enough levels exist
to overflow.

## Responsive checkpoints

The geometry must remain proportional at 360, 390 and 412 CSS px viewport
widths. Height is deliberately not used for the hero because Telegram browser
chrome changes the available viewport height during a session.

## Data boundary

No Supabase schema/data mutation is required for this stage. Geometry is owned
by the React/CSS shell. Existing static class icon atlases remain the fallback;
reference-media bindings can override artwork later without changing layout.
