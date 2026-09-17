# Character Sheet Header · Stage 5 Mobile QA

Stage 5 closes the first header pass by hardening the approved 40/30/30 composition against the actual mobile widths and bad-content cases that tend to break otherwise pretty mockups.

## Scope

- target widths: 360, 390 and 412 CSS px;
- Telegram/Android vertical scrolling and reduced-motion behaviour;
- short and long character names;
- missing subclass/race values;
- missing portrait media;
- the six-item right rail from Stage 3;
- existing class PNG frames and background art from Stage 4.

No character mechanics, database schema, media registry or class art is changed in this stage.

## Geometry invariants

- Stage 1 remains authoritative: portrait 40%, identity 30%, navigation 30%.
- Long names may occupy at most two lines and are allowed to break inside one pathological token instead of widening the identity column.
- Class, race, subclass, level and inspiration stay bounded by the middle track.
- Empty subclass/race placeholders preserve hierarchy and vertical rhythm rather than collapsing the layout.
- Missing portrait media renders a neutral aperture inside the same portrait viewport. It does not resize the frame or expose broken-image UI.
- The navigation rail keeps exactly three visible rows and scrolls internally.
- `Заклинания` stays on one line without ellipsis at 360/390/412 px.

## Asset invariants

- Stage 4's 941:1672 frame viewport remains authoritative.
- A portrait never escapes the PNG aperture.
- A missing portrait does not remove or resize the class frame.
- Background art remains a paint layer and cannot participate in layout sizing.

## Automated regression lock

`tests/characterSheetHeaderStage5.test.ts` checks the source-level contract so later CSS cleanup cannot silently remove the mobile guardrails:

- Stage 5 CSS is imported after Stage 4;
- the 360–412 mobile QA range exists;
- long-name breaking and two-line identity behaviour remain present;
- missing-portrait handling remains present;
- the canonical six navigation labels remain in the approved order;
- the Stage 4 fixed frame aspect remains 941:1672.

This is a regression guard, not a replacement for visual-device review. A real Telegram Android screenshot pass is still the final human check because browsers, fonts and safe-area chrome remain capable of inventing fresh nonsense.

## Supabase boundary

No migration or data mutation is required. Existing `media_bindings`, media presentation data and character/template fields continue to feed the same runtime surfaces.

## Acceptance

- 360 / 390 / 412 CSS-px layouts keep the same 40/30/30 structure.
- Long names cannot push navigation or portrait geometry.
- Missing subclass/race values do not collapse the identity block.
- Missing portraits remain visually intentional and bounded.
- `Заклинания` remains fully readable in the rail.
- reduced-motion users do not receive smooth programmatic rail movement.
- `main` is untouched; all work remains on `dev` until separately approved.
