# MEGANOT UI v1

This directory is the only foundation for the new MEGANOT UI 1.0 presentation layer.

## Rules

- New UI code uses `--mg-*` semantic tokens rather than legacy `--app-*` values.
- Screens should not import Radix primitives directly. Use wrappers from `overlays/`.
- Motion timings and springs come from `motion/presets.ts`.
- Global transient UI renders through the shared `LayerHost`.
- `MotionConfig reducedMotion="user"` is owned by the App Shell.
- `Surface` is a material primitive, not a universal card component. It should not dictate product layout.
- Legacy screens may remain embedded temporarily, but new UI code must not extend the old visual version chain.

## Structure

- `foundation/`: semantic tokens, type scale, materials, interaction states
- `motion/`: shared motion language
- `primitives/`: small Meganot-owned building blocks
- `overlays/`: Meganot wrappers around headless overlay behavior
- `shell/`: viewport, backdrop, scene, chrome and navigation
- `screens/`: new UI 1.0 screens
