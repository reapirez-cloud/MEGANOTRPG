# Design QA · Character spell panels · Stage 2

- Source visual truth: `/workspace/scratch/984bd3b46be4/upload/01-1000240758.jpg`
- Source pixels: `716 × 1536`, sRGB JPEG.
- Implementation route: `http://terminal.local:4173/e2e-character-spell-panels-stage2.html`
- Intended CSS viewport: mobile `390 × 844`, density `1`.
- State: cleric level 5; circles 1–5 available; circle 1 expanded; cantrips, circles 2 and 3 collapsed.
- Implementation screenshot: unavailable.

## Full-view comparison evidence

The source image was opened and inspected. The implementation route was built and served through `sites-preview`, but the Work Mode cloud browser rejected both the route and preview root with `net::ERR_BLOCKED_BY_CLIENT`. No browser-rendered screenshot could be captured, so a visual comparison would be fabricated and was not attempted.

## Focused region comparison evidence

Blocked with the full-view capture. The intended focused regions are:

1. Nine-slot header strip.
2. Collapsed cantrip/circle preview row.
3. Expanded two-column spell grid.

## Automated structural evidence

- Production TypeScript/Vite build passes.
- Stage 2 contract tests pass.
- Layout contract asserts nine equal slot columns, two expanded spell columns, three preview spells, class theme tokens, authored sprite atlases, and maintained icon-library controls.

## Findings

- [P1] Browser-rendered evidence is missing.
  - Location: Work Mode preview connection.
  - Evidence: browser returned `net::ERR_BLOCKED_BY_CLIENT` for the preview root and the Stage 2 route.
  - Impact: exact spacing, text wrapping, asset crop, and mobile overflow cannot be certified visually.
  - Fix: capture the Stage 2 fixture in an available browser at `390 × 844`, compare it with the source in one combined input, then correct any P1/P2 drift.

## Required fidelity surfaces

- Fonts and typography: implemented with the sheet's existing Georgia display stack and responsive sizes; visual certification blocked.
- Spacing and layout rhythm: encoded from the reference as nine slots, compact accordion headers, three-card previews, and a two-column expanded grid; visual certification blocked.
- Colors and visual tokens: intentionally use current class theme variables instead of the source gold palette; visual contrast certification blocked.
- Image quality and asset fidelity: uses existing authored class/spell sprite atlases and Phosphor controls; rendered sharpness/crop certification blocked.
- Copy and content: reference hierarchy and Russian labels are present; truncation/wrapping certification blocked.

## Comparison history

- Iteration 1: source accepted; implementation capture blocked before comparison. No visual fixes were claimed.

## Implementation checklist

- [x] Build reference anatomy.
- [x] Add isolated deterministic fixture.
- [x] Pass build and structural tests.
- [ ] Capture browser-rendered fixture.
- [ ] Run combined visual comparison.
- [ ] Fix any P0/P1/P2 differences and recapture.

final result: blocked
