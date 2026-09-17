# Character Sheet Header · Stage 2 Identity

Status: implemented on `dev`.

Stage 2 fills the independent middle 30% header track created by Stage 1. It changes presentation and data wiring only; Character Engine, combat, resources, rests, spells and inventory mechanics are untouched.

## Identity composition

The middle track now has a fixed information hierarchy:

1. character name;
2. class and level;
3. separator;
4. subclass;
5. race;
6. separator;
7. two inspiration slots.

Long names and labels are clipped inside the middle track and cannot resize the portrait or navigation tracks. The compact layout remains width-driven for the 360 / 390 / 412 CSS px mobile targets used by the Telegram Mini App.

## Data sources

- name, class and level come from the existing character record already loaded by `useUiV1CharacterControl`;
- race prefers `character_sheets.race`; when that legacy/display field is empty, the UI falls back to the assigned `subrace` template and then the assigned `race` template;
- subclass comes from the currently assigned `subclass` rule template;
- no duplicate Supabase request is introduced for the header.

Missing race or subclass is shown explicitly instead of silently inventing a value.

## Inspiration boundary

The two inspiration cells are intentionally presentation-only in Stage 2. The mechanical audit found no canonical inspiration state yet, so this stage does not fake a value, write a one-off field, or create a second source of truth merely to make two diamonds light up. The cells are placeholders for the later canonical inspiration resource/state implementation.

## Geometry boundary

Stage 1 remains authoritative for the 40% / 30% / 30% geometry. Stage 2 only styles content inside the identity track. Portrait framing, crop behaviour and navigation semantics are unchanged.

Stage 3 owns the final right-hand navigation content/order and typography tuning.
