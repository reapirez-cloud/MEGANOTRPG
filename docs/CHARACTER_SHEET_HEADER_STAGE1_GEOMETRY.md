# Character Sheet Header · Stage 1 Geometry

Status: implemented on `dev`.

This stage changes header geometry only. It does not change Character Engine mechanics, character data, class art, navigation semantics, or any content below the persistent character header.

## Geometry contract

The masthead is divided into three independent horizontal zones:

1. portrait — 40%;
2. identity — 30%;
3. navigation — 30%.

All three CSS grid tracks use `minmax(0, ...)`, so long text or navigation labels cannot resize neighbouring zones. Header height stays width-driven through the existing `--sheet-hero-height`; no viewport-height dependency is introduced.

The full hero/background surface still spans the whole masthead, while portrait, identity and navigation placement are constrained by the three fixed zones.

## Portrait zone

- the existing authored 9:16 class portrait frame remains authoritative;
- the frame is centred inside the left 40% zone;
- the portrait/fallback cannot determine identity or navigation width;
- existing crop, clipping and media behaviour are preserved;
- no new portrait asset system is introduced.

## Identity zone

Stage 1 only moves the existing identity payload into the independent middle 30% zone and prevents its content from changing neighbouring geometry.

The final identity composition — name, class, race, subclass, level, separators and the two-slot inspiration placeholder — belongs to Stage 2.

## Navigation zone

Stage 1 only gives the existing rail an independent right-hand 30% track. Current rail contents, three-row internal viewport, scrolling behaviour and active-state semantics are preserved.

The final entries/order and navigation typography tuning belong to Stage 3.

## Responsive contract

The geometry is width-driven and is intended to remain proportional at 360, 390 and 412 CSS px, including Telegram Mini App on Android. Artwork and text are not allowed to expand one track at the expense of another.

## Data boundary

No Supabase schema or data mutation is required.
No Character Engine, runtime, resource, spell, rest, inventory or inspiration mechanics are changed by this stage.
