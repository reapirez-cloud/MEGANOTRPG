# Character Sheet Overview panel correction · 2026-09-17

This pass adjusts only the visual layout of the Overview resource and spell-slot panels.

## Resources

- The Resources panel no longer darkens or blurs the class/background art.
- The authored PNG resource icon owns a dedicated full-height left rail.
- Name, recharge text, counter and charge icons all render to the right of the PNG.
- The row footprint is increased so the PNG reads as a primary interface element rather than a tiny badge.
- Existing resource mechanics, Snake actions, state keys, spent-state desaturation and red-cross overlay remain unchanged.

## Spell slots

- Horizontal paging remains unchanged.
- Each page now shows three spell levels instead of two.
- Existing slot counts, CE linkage, spent-state visuals and level navigation remain unchanged.

## Scope

The correction is loaded globally for the character-sheet Overview and applies at all supported viewport widths. No Supabase schema/data change is required.
