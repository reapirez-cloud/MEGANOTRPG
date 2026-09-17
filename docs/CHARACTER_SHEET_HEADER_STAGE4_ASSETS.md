# Character Sheet Header · Stage 4 Assets

Status: implemented on `dev`.

Stage 4 binds the existing visual assets to the header geometry already locked by Stage 1. It does not redesign the art, change class colors, change navigation contents, or introduce gameplay mechanics.

## Asset contract

The header uses the already-authored MEGANOT assets:

- the class-specific lossless 9:16 PNG portrait frame;
- the character portrait/media crop;
- the class sheet background/reference-art binding;
- the existing rail icon layer;
- the existing neutral darkening/haze system used to keep text readable.

The visual layer is subordinate to layout. No PNG, portrait crop, background image, or icon is allowed to resize the 40% / 30% / 30% tracks.

## Portrait frame

The frame is centered inside the left 40% track at the fixed 20% header axis. The authored frame remains 9:16 and is rendered with `object-fit: contain`, so transparent padding or source PNG dimensions cannot distort it.

The portrait itself is a separate layer below the frame and is clipped to the frame aperture (`6% 10.5% 6.5%`). The old free-portrait mask/fade is disabled inside framed portraits, preventing the avatar from leaking outside the authored opening.

Unsupported/default classes keep a stable fallback portrait viewport inside the same left track.

## Class background

The existing class background remains a paint-only surface. Runtime campaign reference-art bindings still override bundled fallbacks through the existing `class:<classKey>:sheet_background` path. Stage 4 adds no new media storage or Supabase source of truth.

## Readability layers

The neutral portrait shade and haze are restored over the art layer because earlier character-sheet passes intentionally disabled them. They do not recolor class artwork; they only preserve text/control readability across bright and dark source images.

Identity and navigation stay above all art layers by explicit z-order.

## Scope boundary

Stage 3 navigation contents/order/typography are intentionally not implemented by this stage. Stage 4 can land before Stage 3 because it does not change rail semantics.

No Character Engine, Supabase schema/data, inspiration mechanics, inventory mechanics, spell mechanics, or rest mechanics are changed.
