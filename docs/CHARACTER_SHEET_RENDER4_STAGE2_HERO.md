# Character Sheet · Render 4 · Stage 2 Hero

Stage 2 locks the approved hero composition.

## Contract

- The character artwork is full bleed and owns the entire hero area.
- There is no card frame, masthead border or separate header surface.
- The portrait fades into the class sheet background at the bottom.
- The right side is deliberately darkened so the internal navigation rail stays
  readable without putting an opaque panel behind it.
- The identity block remains directly on the artwork.
- A restrained class-accent rule sits under the identity, matching the approved
  render's visual rhythm.
- The back action floats on top of the artwork.
- If a character has no portrait, the class sheet background becomes the hero
  fallback without changing geometry.

## Media behavior

Existing character avatar/crop presentation remains authoritative. When no
authored crop exists, the default hero crop biases the subject slightly left so
the navigation rail has visual breathing room.

No Supabase schema mutation is required. The live William Kidd test character
already has an avatar, so Stage 2 can be verified against real data without
inventing fallback content.

## Out of scope

Navigation icon polish, final rail styling, glass panel tuning, resources,
spell slots, and final pixel QA remain in later roadmap stages.
