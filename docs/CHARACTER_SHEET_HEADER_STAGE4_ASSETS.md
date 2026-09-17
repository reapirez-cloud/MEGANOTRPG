# Character Sheet Header · Stage 4 Asset Fit

Stage 4 locks how existing MEGANOT art is fitted into the Stage-1 header geometry. It does not redesign the user's PNGs, change class colors, or introduce new character mechanics.

## Ownership

- Stage 1 owns the 40% portrait / 30% identity / 30% navigation geometry.
- Stage 2 owns identity content and hierarchy.
- Stage 3 owns navigation order, typography and internal scrolling.
- Stage 4 owns only media fitting, clipping and paint-layer boundaries.

Artwork never participates in grid sizing. A portrait, class background or frame can be replaced without moving the identity or navigation columns.

## Portrait frame contract

- Authored class frames are treated as a fixed 941:1672 viewport, matching the current production PNG family closely enough to preserve the aperture without letting source dimensions drive layout.
- The frame is centred in the left 40% track.
- The character portrait is rendered as a separate layer underneath the PNG frame and clipped inside the existing aperture insets.
- Saved `CampaignMediaFrame` crop/presentation data remains valid inside that aperture.
- The portrait cannot bleed over the frame, identity column or navigation rail.
- Missing/unknown class frames fall back to the same fixed portrait viewport instead of expanding to fill the available track.
- Dead-character desaturation continues to apply to the framed portrait treatment.

## Background contract

Class sheet art remains a decorative layer. It may span the complete masthead, but it is absolutely positioned and cannot affect track width or header height. Neutral header veils remain independent from the artwork so unusually bright assets do not destroy text readability.

## Supabase boundary

The existing media system remains authoritative for runtime overrides. No new table, storage bucket, migration or parallel asset registry is introduced.

Verified on 2026-09-17:
- active `class:*:portrait_frame` bindings exist for 7 classes;
- those bound assets are PNG and are 941×1671 or 941×1672;
- no active `class:*:sheet_background` runtime binding is currently required, so built-in class-background fallbacks continue to work normally.

The absence or presence of a Supabase media override must never change layout geometry.

## Acceptance

- Existing PNG portrait frames stay lossless and undistorted.
- Portraits stay inside the frame aperture.
- Replacing a frame/background does not move identity or navigation.
- Framed and frameless characters occupy the same left-track visual footprint.
- 360 / 390 / 412 CSS-px mobile widths preserve the same composition.
- No Supabase schema or data mutation is required for Stage 4.
