# Character Sheet · Render 4 · Stage 5 Resources + Spell Slots

Stage 5 locks the class resource and spell-slot presentation.

## Authored assets

The sheet uses the existing authored PNG atlases:

- `/ui-v1/character-sheet/icons/class-resources.png`
- `/ui-v1/character-sheet/icons/class-spell-slots.png`
- `/ui-v1/character-sheet/icons/spent-resource-cross.png`

All 13 prepared class keys keep a dedicated atlas cell. No generated replacement
icons are introduced in this stage.

## Resource block

- The resource block is a narrow class-tinted glass surface.
- The main class/resource icon is intentionally larger than the charge markers.
- The current/max counter stays on the right.
- Individual charges use the same authored icon language.
- A fully depleted resource desaturates the main icon and overlays the red cross.
- A partially spent resource keeps the main icon active while each spent charge
  becomes grayscale and receives the same red-cross overlay.
- The cross is an overlay on the icon. It never occupies a second layout cell.

## Spell slots

- Spell slots use the authored per-class spell-slot icon.
- Each spell level is one fixed-height row.
- Up to four slots are presented as four icon columns in that row.
- The viewport shows at most four spell-level rows at once.
- Levels beyond the first four scroll vertically inside the slot panel.
- Rows use vertical scroll snap.
- Overscroll remains `auto` so reaching the top/bottom can hand scrolling back
  to the main character sheet, preserving the Telegram/mobile contract.

## Interaction

Normal tap keeps the existing behavior:
- resource -> resource detail,
- spell-slot row -> spells focused to that level,
- long press -> Snake context.

Stage 5 changes presentation, not Character Engine resource arithmetic.
