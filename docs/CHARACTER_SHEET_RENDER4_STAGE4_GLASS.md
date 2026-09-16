# Character Sheet · Render 4 · Stage 4 Characteristics + Glass

Stage 4 locks the 50/50 characteristic panel and its interaction language.

## Layout

- The panel remains one shared surface split 50/50.
- Left: AC, passive perception, proficiency, initiative, speed and spell values.
- Right: STR, DEX, CON, INT, WIS and CHA.
- The split is expressed by one internal class-tinted divider, not two detached cards.
- No heavy outer frame is used.

## Glass language

- The surface is translucent and class-tinted.
- The class background remains visible behind it.
- Blur, saturation reduction and a restrained inner edge create the glass effect.
- Borders are replaced by subtle inner edge light and thin internal separators.
- Class accent appears in iconography and separators rather than filling the panel.

## Icons

Quick stats and abilities now use inline vector symbols. Placeholder Unicode
glyphs are no longer part of the visible characteristics UI.

## Expanded ability

Tapping an ability keeps the left quick-stat column stable and replaces the
right ability list with that ability's detail.

The detail stays inside the same right column:
- ability value and modifier remain at the top,
- saving throw follows,
- skills for the selected ability follow below,
- tapping the expanded header collapses it.

The transition is short and local. It must never move the user to another
screen or change the overall sheet geometry.

## Responsive behavior

The 50/50 split remains intact at 360, 390 and 412 CSS px. At very narrow
widths the decorative BODY/MIND/SPIRIT label is hidden before core values are
compressed.
